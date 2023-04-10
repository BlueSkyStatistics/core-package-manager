const axios = require('axios')
// const {maxSatisfying: semverMaxSatisfying, lte: semverLte, satisfies: satisfyVer} = require('semver')
// const {this.manager.squirrelly.Render} = require('squirrelly')
const {writeFileSync, copyFileSync, unlink} = require('original-fs')
const {normalize, join} = require("path")

// const {this.manager.store} = global


class RemotePackage {
    constructor({
                    manager, name, path, importpath, devimportpath, storage,
                    artifactType, sourceType, remote, update, removable
                }) {
        this.manager = manager
        this.userDataPath = this.manager.store.get("userData")
        this.appRoot = this.manager.store.get("appRoot")
        this.name = name
        this._path = path
        this.path = normalize(this.manager.squirrelly.Render(this._path, {
            locals: this.userDataPath,
        }))
        this._importpath = importpath
        // this.importPath = Sqrl.this.manager.squirrelly.Render(this._importpath, {
        //     locals: this.userDataPath,
        //     appRoot: this.appRoot
        // })
        this._devimportpath = devimportpath
        // this.devImportPath = Sqrl.this.manager.squirrelly.Render(this._devimportpath, {
        //     locals: this.userDataPath,
        //     appRoot: this.appRoot
        // })

        this.storage = storage
        this.artifactType = artifactType
        this.sourceType = sourceType
        this.remote = remote.trim()
        this.remotePath = normalize(this.manager.squirrelly.Render(this.urlMapped[this.storage], {repo: this.remote}))

        this.update = update
        this.removable = removable
        this.version = '0.0.0'
        this.description = ""

        this.details = {}
        this.versions = []
    }

    satisfyVersion = pkgName => {
        const installedPackages = this.manager.store.get("installedPackages")
        return installedPackages.hasOwnProperty(
            Object.keys(pkgName)[0]) && this.manager.semver.satisfies(
            installedPackages[Object.keys(pkgName)[0]],
            Object.values(pkgName)[0]
        )
    }

    checkVersionAndUpdateFile = (pkg, filepath) => {
        // const installedBSkyVersion = this.manager.store.get("installedPackages").BlueSky
        const installedBSkyVersion = this.manager.store.get("version")
        const errors = []
        if (!(
            pkg.minBSkyVersion === undefined ||
            // adding .0 because BSky versions are done with only 2 digits
            this.manager.semver.lte(`${pkg.minBSkyVersion}.0`, `${installedBSkyVersion}.0`)
        )) {
            errors.push(`package ${this.name} requires BSky R Package version: ${pkg.minBSkyVersion} but current version is ${installedBSkyVersion})`)
        }
        pkg.requiredPackages?.forEach(item => {
            if (!this.satisfyVersion(item)) {
                errors.push(`required R Package ${Object.keys(item)[0]} version: ${Object.values(item)[0]} but current version is ${this.manager.store.get("installedPackages")[item[0]]}`)
            }
        })
        if (errors.length === 0) {
            this.manager.ipcRenderer.invoke('status-message', {"message": `"Updating ${this.name}...`})
            copyFileSync(normalize(filepath), this.path)
        } else {
            this.manager.ipcRenderer.invoke('bsevent', {'event': 'versionUpdateError', 'data': errors.join('\n')})
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
                this.manager.semver.maxSatisfying(this.versions.map(i => Object.keys(i)[0]), "*") :
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
