const Store = require('electron-store')
const sessionStore = new Store({name: 'constants'})
const {Render} = require('squirrelly')
const path = require('path')
const { existsSync, unlinkSync, copyFileSync } = require('original-fs')


class LocalPackage {
    get userDataPath() {
        return sessionStore.get("userData")
    }

    get appRoot() {
        return sessionStore.get("appRoot")
    }

    constructor({name, path, importpath, devimportpath, storage, artifactType, sourceType, remote, update, removable}) {
        this.name = name
        this._path = path
        this.path = Render(this._path, {
            'locals': this.userDataPath,
            'appRoot': this.appRoot
        })
        this._importpath = importpath
        this.importPath = Render(this._importpath, {
            locals: this.userDataPath,
            appRoot: this.appRoot
        })
        this._devimportpath = devimportpath
        this.devImportPath = Render(this._devimportpath, {
            locals: this.userDataPath,
            appRoot: this.appRoot
        })
        this.artifactType = artifactType
        this.sourceType = sourceType
        this.storage = storage
        this.remote = remote.trim()
        this.update = update
        this.removable = removable
        this.version = '0.0.0'



        // this.type = packageJson.artifactType
        this.description = ""
        this.getLocalVersion()
    }

    getAsarVersion = () => {
        try {
            const pkg = require(path.join(this.path, 'package.json'))
            this.version = pkg.version
            this.description = pkg.productName // question: why not pkg.description?
            delete require.cache[path.join(this.path, 'package.json')]
        } catch (err) {
            console.warn(err)
            this.version = '0.0.0'
        }
    }

    getNonAsarVersion = () => {
        try {
            const pkg = require(path.join(this.path, 'package.json'))
            this.version = pkg.version
            this.description = pkg.productName // question: why not pkg.description?
            delete require.cache[path.join(this.path, 'package.json')]
        } catch (err) {
            console.warn(err)
            this.version = '0.0.0'
        }
    }

    typeMapping = {
        // question: what is the difference between asar and non-asar?
        asar: this.getAsarVersion,
        local: this.getNonAsarVersion
    }

    getLocalVersion() {
        return this.typeMapping[this.artifactType]()
    }

    get originalJson() {
        const {name, _path: path, _importpath: importpath,
            _devimportpath: devimportpath, storage,
            artifactType, sourceType, remote,
            update, removable} = this
        return {name, path, importpath, devimportpath, storage,
            artifactType, sourceType, remote, update, removable}
    }

    get realImportPath() {
        return sessionStore.get("appMode") === 'prod' ? this.importPath : this.devImportPath
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
            if (key === 'css') {
                const cssImportPath = importPath.split('/').slice(0, -1).join('/') + '/css/'
                value.forEach(cssFileRelativePath => {
                    try {
                        this.loadCss(cssImportPath + cssFileRelativePath)
                    } catch {
                        console.warn('Could not import css file', cssFileRelativePath)
                    }
                })
            } else {
                global[key] = value
            }
        })
    }

    importAllFromPackage() {
        // question: why do we force import devImportPath?
        console.log(sessionStore.get("appMode"))
        try {
            console.log(`Importing from ${this.realImportPath}`)
            this.handleImport(this.realImportPath)
        } catch(err) {
            console.log(err)
            console.log(`Importing from ${this.devImportPath}`)
            this.handleImport(this.devImportPath)
        }
        
    }

    requirePackage() {
        console.log(sessionStore.get("appMode"))
        try{
            console.log(`Importing from ${this.realImportPath}`)
            require(this.realImportPath)
        } catch(err) {
            console.log(err)
            console.log(`Importing from ${this.devImportPath}`)
            require(this.devImportPath)
        }
    }

    get installerPath() {
        return Render(this._path, {
            locals: path.join(this.appRoot.replace("app.asar", ""), 'package', 'asar')
        })
    }

    getInstallerVersion() {
        const pkg = require(path.join(this.installerPath, 'package.json'))
        const {version} = pkg
        delete require.cache[path.join(this.path, 'package.json')]
        return version
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
}

module.exports = LocalPackage