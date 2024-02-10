const axios = require('axios')
const {maxSatisfying: semverMaxSatisfying, lte: semverLte, satisfies: satisfyVer} = require('semver')
const {Render} = require('squirrelly')
const {writeFileSync, copyFileSync, unlink} = require('original-fs')
const {normalize, join} = require("path")
const path = require("path");
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
    constructor({name, path, importpath, devimportpath, storage, artifactType, sourceType, remote, update, removable, moduleType}, firebaseClient) {
        this.userDataPath = sessionStore.get("userData")
        this.appRoot = sessionStore.get("appRoot")
        this.firebaseClient = firebaseClient

        this.name = name
        this.moduleType = moduleType
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
        // const installedBSkyVersion = sessionStore.get("version")
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


    firebaseReleaseVersion = async versionToUpdate => {
        try {
            var data = await this.firebaseClient.getPackageVersions(this.remotePath)
            this.versions = data.map(i => ({
                [i.version]: i
            }))
            this.version = versionToUpdate === undefined ?
                    semverMaxSatisfying(this.versions.map(i => Object.keys(i)[0]), "*") :
                    versionToUpdate

            this.details = this.versions.find(i => Object.keys(i)[0] === this.version)[this.version]
        } catch (e) {
            console.warn('firebaseReleaseVersion error', e)
            this.version = '0.0.0'
            this.details = {}
        }
    }

    gitReleaseVersion = async versionToUpdate => {
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

    firebaseReleaseAsarInstall = async () => {
        const {filePath, filename} = this.details
        const fullPath = filePath + '/' + filename
        const formattedName = `${path.parse(this.path).name}_${this.version}.asar`
        const formattedPath = path.parse(this.path).dir
        const asarPath = path.join(formattedPath, formattedName)
        // console.log(fullPath)
        try {
            await this.firebaseClient.downloadFile(fullPath, asarPath)
            const pkg = require(normalize(join(asarPath, 'package.json')))
            return this.checkVersionAndUpdateFile(pkg, asarPath)
        } catch (e) {
            console.warn({fullPath, asarPath})
            console.warn(e)
        }
        return false
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
        firebase: {
            release: this.firebaseReleaseVersion
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
        firebase: {
            asar: this.firebaseReleaseAsarInstall
        },
        local: {
            local: () => true
        }
    }

    urlMapped = {
        github: 'https://api.github.com/repos/{{repo}}/releases',
        firebase: '{{repo}}',
        local: '{{repo}}'
    }

    installPackage = async () => await this.installType[this.storage][this.artifactType]()

    getRemoteDetails = async versionToUpdate => {
        await this.typeMapping[this.storage][this.sourceType](versionToUpdate)
    }

}

module.exports = RemotePackage
