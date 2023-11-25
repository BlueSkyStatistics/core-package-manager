const {Render} = require('squirrelly')
const {join, normalize} = require('path')
const {existsSync, unlinkSync, copyFileSync} = require('original-fs')
const {gt, maxSatisfying} = require("semver");
const DownloadManager = require("./DownloadManager");
const {sessionStore} = global


class LocalPackage {

    get importPath() {
        return normalize(join(this.path, this.main ? this.main : ''))
    }

    constructor(moduleData, availableVersions = {}) {
        this.availableVersions = availableVersions
        this.name = moduleData.name
        this.group = moduleData.group
        this.rawPath = moduleData.path
        // this.artifactType = moduleData.artifactType
        this.storage = moduleData.storage
        this.updateStrategy = moduleData.update
        this.removable = moduleData.removable
        this.minBSkyVersion = moduleData.minBSkyVersion
        this.minAppVersion = moduleData.minAppVersion
        this.extra = moduleData.extra

        this.version = '0.0.0'
        this.main = undefined
        this.exists = false



        this.path = join(normalize(Render(this.rawPath, {
            'locals': sessionStore.get('userData'),
            'appRoot': sessionStore.get('appRoot')
        })))
        // const root = this.artifactType ? `${this.name}.${this.artifactType}` : this.name
        // this.root = join(this.path, root)

        const packageMetaPath = normalize(join(this.path, 'package.json'))
        if (existsSync(this.path)) {
            try {
                const pkgMeta = require(packageMetaPath)
                const {version, main} = pkgMeta
                this.meta = pkgMeta
                this.version = version
                this.main = main
                this.exists = true
                delete require.cache[packageMetaPath]
            } catch (err) {
                console.warn(err)
            }
            
        }
        this.installerPath = Render(this.rawPath, {
            locals: normalize(join(sessionStore.get("appRoot").replace("app.asar", ""), 'package', 'asar'))
        })
    }

    loadCss = url => {
        const el = document.createElement("link")
        el.type = "text/css"
        el.rel = "stylesheet"
        el.href = url
        document.getElementsByTagName("head")[0].appendChild(el)
    }

    handleImport = importPath => {
        Object.entries(require(importPath)).forEach(([key, value]) => {
            switch (key) {
                case 'init':
                    ipcRenderer.invoke("debug", {
                        message: `Init detected for ${importPath} initializing...`,
                        source: "LocalPackage",
                        event: "spawn"
                    })
                    try {
                        console.log(`Invoking [init] from ${importPath}`)
                        value({global})
                    } catch (e) {
                        console.log(e.stack)
                        ipcRenderer.invoke("debug", {
                            message: `Init error at ${importPath} ${e}`,
                            source: "LocalPackage",
                            event: "spawn"
                        })
                    }
                    break
                case 'css':
                    const cssImportPath = normalize(importPath.split('/').slice(0, -1).join('/') + '/css/')
                    value.forEach(cssFileRelativePath => {
                        try {
                            this.loadCss(cssImportPath + cssFileRelativePath)
                        } catch {
                            console.warn('Could not import css file', cssFileRelativePath)
                        }
                    })
                    break
                default:
                    global[key] = value
            }
        })
    }

    importAllFromPackage() {
        if (!this.exists) {
            console.warn(`Cannot import ${this.name} because it does not exist`)
            return
        }
        try {
            console.log(`Importing [importAllFromPackage] from ${this.importPath}`)
            this.handleImport(this.importPath)
        } catch (err) {
            console.log(err)
        }

    }

    requirePackage() {
        try {
            console.log(`Importing [requirePackage] from ${this.importPath}`)
            require(this.importPath)
        } catch (err) {
            console.log(err)
        }
    }

    getInstallerVersion() {
        try {
            const pkg = require(normalize(join(this.installerPath, 'package.json')))
            const {version} = pkg
            delete require.cache[normalize(join(this.path, 'package.json'))]
            return version
        } catch (e) {
            console.warn('Cannot get version for ', this.name)
            return '0.0.0'
        }
    }

    copyFromInstaller() {
        try {
            if (existsSync(this.installerPath)) {
                copyFileSync(this.installerPath, this.path)
                return true
            }
        } catch (err) {
            console.log(err)
        }
        return false
    }

    removePackage() {
        try {
            unlinkSync(this.path)
        } catch {
            console.log(`Could not remove file ${this.path}`)
        }
    }

    async update(isOffline, versionToUpdate = undefined) {
        if (this.storage === 'dev') {
            // do nothing if developing plugin
            console.log(
                'Modules with storage type "dev" can only be updated manually.',
                `${this.name}: ${this.version} --> ${versionToUpdate}`
            )
            return false
        }
        let restartNeeded = false
        let targetVersion = versionToUpdate || maxSatisfying(Object.keys(this.availableVersions).map(i => i), "*")

        if (!this.exists) {
            if (this.copyFromInstaller()) {
                return true
            }
        }
        // if (this.sourceType === 'local') {
        if (this.storage === 'local') {
            if (gt(this.getInstallerVersion(), this.version)) {
                restartNeeded = this.copyFromInstaller()
            }
            return restartNeeded
        }
        if (isOffline) {
            return false
        }
        if (targetVersion === null || targetVersion === undefined) {
            console.log('No available versions found for ', this.name)
            return false
        }
        const updateModuleMeta = this.availableVersions[targetVersion]
        switch (this.updateStrategy) {
            case 'auto':
                if (gt(targetVersion, this.version)) {
                    const dlManager = new DownloadManager(updateModuleMeta, this.path)
                    const installSuccess = await dlManager.installPackage()
                    // restartNeeded = restartNeeded || await remote.installPackage()
                    restartNeeded = restartNeeded || installSuccess
                }
                break
            case 'manual':
                if (versionToUpdate) {
                    const dlManager = new DownloadManager(updateModuleMeta, this.path)
                    const installSuccess = await dlManager.installPackage()
                    restartNeeded = restartNeeded || installSuccess
                }
                await ipcRenderer.invoke('core-module-update-available', module)
                break
            default:
                console.warn('Update mode unknown: ', this.meta.update)
        }
        return restartNeeded
    }
}

module.exports = LocalPackage