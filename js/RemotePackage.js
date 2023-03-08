const axios = require('axios')
const {maxSatisfying: semverMaxSatisfying, lte: semverLte, satisfies: satisfyVer} = require('semver')
const {ipcRenderer} = require('electron')
const {Render} = require('squirrelly')
const {writeFileSync, copyFileSync, unlink} = require('original-fs')
const {normalize, join} = require("path")
const {sessionStore} = global

const satisfyVersion = pkgName => {
    const installedPackages = sessionStore.get("installedPackages")
    return installedPackages.hasOwnProperty(
        Object.keys(pkgName)[0]) && satisfyVer(
        installedPackages[Object.keys(pkgName)[0]],
        Object.values(pkgName)[0]
    )
}

class RemotePackage {
    constructor({name, path, importpath, devimportpath, storage, artifactType, sourceType, remote, update, removable}) {
        this.userDataPath = sessionStore.get("userData")
        this.appRoot = sessionStore.get("appRoot")
        this.name = name
        this._path = path
        this.path = normalize(Render(this._path, {
            locals: this.userDataPath,
        }))
        this._importpath = importpath
        // this.importPath = Sqrl.Render(this._importpath, {
        //     locals: this.userDataPath,
        //     appRoot: this.appRoot
        // })
        this._devimportpath = devimportpath
        // this.devImportPath = Sqrl.Render(this._devimportpath, {
        //     locals: this.userDataPath,
        //     appRoot: this.appRoot
        // })

        this.storage = storage
        this.artifactType = artifactType
        this.sourceType = sourceType
        this.remote = remote.trim()
        this.remotePath = normalize(Render(this.urlMapped[this.storage], {repo: this.remote}))

        this.update = update
        this.removable = removable
        this.version = '0.0.0'
        this.description = ""

        this.details = {}
        this.versions = []
    }

    checkVersionAndUpdateFile = (pkg, filepath) => {
        const installedBSkyVersion = sessionStore.get("installedPackages").BlueSky
        const errors = []
        if (!(
            pkg.minBSkyVersion === undefined ||
            // adding .0 because BSky versions are done with only 2 digits
            semverLte(`${pkg.minBSkyVersion}.0`, `${installedBSkyVersion}.0`)
        )) {
            errors.push(`package ${this.name} requires BSky R Package version: ${pkg.minBSkyVersion} but current version is ${installedBSkyVersion})`)
        }
        pkg.requiredPackages?.forEach(item => {
            if (!satisfyVersion(item)) {
                errors.push(`required R Package ${Object.keys(item)[0]} version: ${Object.values(item)[0]} but current version is ${sessionStore.get("installedPackages")[item[0]]}`)
            }
        })
        if (errors.length === 0) {
            ipcRenderer.invoke('status-message', {"message": `"Updating ${this.name}...`})
            copyFileSync(normalize(filepath), this.path)
        } else {
            ipcRenderer.invoke('bsevent', {'event': 'versionUpdateError', 'data': errors.join('\n')})
        }
        // deleteFile(filepath)
        // delete require.cache[path.join(filepath, 'package.json')]
        delete require.cache[normalize(join(filepath, 'package.json'))]
        unlink(normalize(filepath), err => err && console.log(err))
        return errors.length === 0
    }

    fileDownloadAndSave = async (fileUrl, filePath) => {
        return axios.get(fileUrl, {responseType: "arraybuffer"}).then((response) => {
            writeFileSync(normalize(filePath), Buffer.from(response.data))
        })
    }

    gitReleaseVersion = async versionToUpdate => {
        // question: why outerthis??
        try {
            const resp = await fetch(this.remotePath)
            const data = await resp.json()
            this.versions = data.map(i => ({
                [i.tag_name]: i
            }))

            this.version = versionToUpdate === undefined ?
                semverMaxSatisfying(this.versions.map(i => Object.keys(i)[0]), "*") :
                versionToUpdate

            this.details = this.versions.find(i => Object.keys(i)[0] === this.version)[this.version]
        } catch (e) {
            console.warn('gitReleaseVersion error', e)
            this.version = '0.0.0'
            this.details = {}
        }
    }

    gitReleaseAsarInstall = async () => {
        const fileUrl = this.details.assets[0].browser_download_url
        const asarPath = `${this.path}_${this.version}.asar`
        try {
            await this.fileDownloadAndSave(fileUrl, asarPath)
            const pkg = require(normalize(join(asarPath, 'package.json')))
            return this.checkVersionAndUpdateFile(pkg, asarPath)
        } catch (e) {
            console.warn({fileUrl, asarPath})
            console.warn(e)
        }
        return false
    }

    typeMapping = {
        github: {
            release: this.gitReleaseVersion
        },
        local: {
            local: () => {
            }
        }
    }

    installType = {
        github: {
            asar: this.gitReleaseAsarInstall
        },
        local: {
            local: () => true
        }
    }

    urlMapped = {
        github: 'https://api.github.com/repos/{{repo}}/releases',
        local: '{{repo}}'
    }

    installPackage = async () => await this.installType[this.storage][this.artifactType]()

    getRemoteDetails = async versionToUpdate => {
        await this.typeMapping[this.storage][this.sourceType](versionToUpdate)
    }

}

module.exports = RemotePackage