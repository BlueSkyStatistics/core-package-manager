const {Render} = require('squirrelly')
const {join, normalize} = require('path')
const {existsSync, unlinkSync, copyFileSync} = require('original-fs')
const {sessionStore} = global


class LocalPackage {
    constructor({name, path, importpath, devimportpath, storage,
                    artifactType, sourceType, remote, update, removable}) {
        this.userDataPath = sessionStore.get("userData")
        this.appRoot = sessionStore.get("appRoot")
        this.name = name
        this._path = path
        this.path = normalize(Render(this._path, {
            'locals': this.userDataPath,
            'appRoot': this.appRoot
        }))
        this._importpath = importpath
        this.importPath = normalize(Render(this._importpath, {
            locals: this.userDataPath,
            appRoot: this.appRoot
        }))
        this._devimportpath = devimportpath
        this.devImportPath = normalize(Render(this._devimportpath, {
            locals: this.userDataPath,
            appRoot: this.appRoot
        }))
        this.artifactType = artifactType
        this.sourceType = sourceType
        this.storage = storage
        this.remote = remote.trim()
        this.update = update
        this.removable = removable
        this.version = '0.0.0'

        this.realImportPath = sessionStore.get("appMode") === 'prod' ? this.importPath : this.devImportPath


        // this.type = packageJson.artifactType
        this.description = ""
        this.installerPath = Render(this._path, {
            locals: normalize(join(this.appRoot.replace("app.asar", ""), 'package', 'asar'))
        })
        this.getLocalVersion()
    }

    getAsarVersion = () => {
        try {
            const pkg = require(normalize(join(this.path, 'package.json')))
            this.version = pkg.version
            this.description = pkg.productName // question: why not pkg.description?
            delete require.cache[normalize(join(this.path, 'package.json'))]
        } catch (err) {
            console.warn(err)
            this.version = '0.0.0'
        }
    }

    typeMapping = {
        asar: this.getAsarVersion,
        local: this.getAsarVersion
    }

    getLocalVersion() {
        return this.typeMapping[this.artifactType]()
    }

    get originalJson() {
        const {
            name, _path: path, _importpath: importpath,
            _devimportpath: devimportpath, storage,
            artifactType, sourceType, remote,
            update, removable
        } = this
        return {
            name, path, importpath, devimportpath, storage,
            artifactType, sourceType, remote, update, removable
        }
    }

    loadCss = url => {
        const el = document.createElement("link")
        el.type = "text/css"
        el.rel = "stylesheet"
        el.href = url
        document.getElementsByTagName("head")[0].appendChild(el)
    }

    handleImport = importPath => {
        Object.entries(require(normalize(importPath))).forEach(([key, value]) => {
            if (key === 'css') {
                const cssImportPath = normalize(importPath.split('/').slice(0, -1).join('/') + '/css/')
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
        // console.log(sessionStore.get("appMode"))
        try {
            console.log(`Importing from ${this.realImportPath}`)
            this.handleImport(this.realImportPath)
        } catch (err) {
            console.log(err)
            console.log(`Importing from ${this.devImportPath}`)
            this.handleImport(this.devImportPath)
        }

    }

    requirePackage() {
        try {
            console.log(`Importing from ${this.realImportPath}`)
            require(this.realImportPath)
        } catch (err) {
            console.log(err)
            console.log(`Importing from ${this.devImportPath}`)
            require(this.devImportPath)
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
}

module.exports = LocalPackage