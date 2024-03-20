const axios = require('axios')
const {maxSatisfying: semverMaxSatisfying, lte: semverLte, satisfies: satisfyVer} = require('semver')
const {Render} = require('squirrelly')
const {writeFileSync, copyFileSync, unlink} = require('original-fs')
const {normalize, join} = require("path")
const path = require("path");
const {sessionStore} = global

const satisfyVersion = pkgName => {
    ipcRenderer.invoke("log", { message: "satisfyVersion before getting installedPkgs:" , source: "_RP", event: "satisfyVersion" })
    const installedPackages = sessionStore.get("installedPackages")
    ipcRenderer.invoke("log", { message: "satisfyVersion after getting installedPkgs::" , source: "_RP", event: "satisfyVersion" })
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
        sessionStore.set("BSKYver",installedBSkyVersion)
        console.log("Install BSky pkg ver:", installedBSkyVersion)
        ipcRenderer.invoke("log", { message: "Installed BSky pkg ver:"+installedBSkyVersion , source: "_RP", event: "checkVersionAndUpdateFile" })
        // const installedBSkyVersion = sessionStore.get("version")
        const errors = []
        if (!(
            pkg.minBSkyVersion === undefined ||
            // adding .0 because BSky versions are done with only 2 digits
            semverLte(`${pkg.minBSkyVersion}.0`, `${installedBSkyVersion}.0`)
        )) {
            ipcRenderer.invoke("log", { message: `package '${this.name}' requires BSky R Package version: '${pkg.minBSkyVersion}' but current version is '${installedBSkyVersion}')` , source: "_RP", event: "checkVersionAndUpdateFile" })
            errors.push(`package ${this.name} requires BSky R Package version: ${pkg.minBSkyVersion} but current version is ${installedBSkyVersion})`)
        }
        pkg.requiredPackages?.forEach(item => {
            if (!satisfyVersion(item)) {
                ipcRenderer.invoke("log", { message: `required R Package '${Object.keys(item)[0]}' version: '${Object.values(item)[0]}' but current version is '${sessionStore.get("installedPackages")[item[0]]}'` , source: "_RP", event: "checkVersionAndUpdateFile" })
                errors.push(`required R Package ${Object.keys(item)[0]} version: ${Object.values(item)[0]} but current version is ${sessionStore.get("installedPackages")[item[0]]}`)
            }
        })
        if (errors.length === 0) {
            ipcRenderer.invoke('status-message', {"message": `Applying updates for ${this.name}...`})
            try{
                copyFileSync(normalize(filepath), this.path)
                ipcRenderer.invoke('status-message', {"message": `${this.name} Updated...`})
                ipcRenderer.invoke("log", { message: `Updates applied for ${this.name}...` , source: "_RP", event: "_RP" })
            } catch (err){
                ipcRenderer.invoke("log", { message: `Updates NOT-applied for ${this.name}...` , source: "_RP", event: "_RP" })
                ipcRenderer.invoke("log", { message: `Error: applying updates ${err.message}...` , source: "_RP", event: "_RP" })
            }

        } else {
            ipcRenderer.invoke('status-message', {"message": `No updates required for ${this.name}...`})
            // ipcRenderer.invoke("log", { message: `No updates required for ${this.name}...` , source: "_RP", event: "_RP" })
            ipcRenderer.invoke('bsevent', {'event': 'versionUpdateError', 'data': errors.join('\n')})
        }
        // deleteFile(filepath)
        // delete require.cache[path.join(filepath, 'package.json')]
        try{
            if(require.cache[normalize(join(filepath, 'package.json'))]){
                ipcRenderer.invoke("log", { message: `Deleting require.cache for ${this.name}` , source: "_RP", event: "_RP" })
                delete require.cache[normalize(join(filepath, 'package.json'))]
            }
            else {
                ipcRenderer.invoke("log", { message: `require.cache not found for ${this.name}` , source: "_RP", event: "_RP" })
            }

            unlink(normalize(filepath), er => {
                if(er){
                    ipcRenderer.invoke("log", { message: `unlink error for ${this.name}` , source: "_RP", event: "_RP" })
                    ipcRenderer.invoke("log", { message: `unlink error: ${er.message}` , source: "_RP", event: "_RP" })
                }
                else {
                    ipcRenderer.invoke("log", { message: `unlinked ${this.name}` , source: "_RP", event: "_RP" })
                }
            });
            ipcRenderer.invoke("log", { message: `required cache cleaned and unlinking done for ${this.name}...` , source: "_RP", event: "_RP" })            
        } catch (err) {
            ipcRenderer.invoke("log", { message: `req-cache cleanup (or unlink) error: ${err.message}` , source: "_RP", event: "_RP" })
        }

        // update check finished (does not matter applied or not, but check is done)
        ipcRenderer.invoke('status-message', {"message": `Update check finished for ${this.name}...`})
        ipcRenderer.invoke("log", { message: `Update check finished for ${this.name}...` , source: "_RP", event: "_RP" })

        return errors.length === 0
    }

    fileDownloadAndSave = async (fileUrl, filePath) => {
        console.log("Trying to start the download process for..",filePath)
        ipcRenderer.invoke("log", { message: `fileDownloadAndSave:Trying to download ...${this.name}` , source: "_RP", event: "_RP" })
        ipcRenderer.invoke('status-message', {"message": `Downloading ${this.name}...`})
        return axios.get(fileUrl, {responseType: "arraybuffer"}).then((response) => {
            writeFileSync(normalize(filePath), Buffer.from(response.data))
        }) .catch(error => {
            ipcRenderer.invoke("log", { message: `Error downloading ${this.name}...` , source: "_RP", event: "_RP" })
            
            // Handle error
            if (error.response) {
              // The request was made and the server responded with a status code
              ipcRenderer.invoke("log", { message: `Resp. status for  ${this.name} : ${error.response.status}` , source: "_RP", event: "_RP" })
              console.error('Response status:', error.response.status);
              console.error('Response data:', error.response.data);
            } else if (error.request) {
              // The request was made but no response was received
              ipcRenderer.invoke("log", { message: `No response received for  ${this.name}` , source: "_RP", event: "_RP" })
              console.error('No response received:', error.request);
            } else {
              // Something happened in setting up the request that triggered an error
              ipcRenderer.invoke("log", { message: `Error: ${error.message}` , source: "_RP", event: "_RP" })
              console.error('Error:', error.message);
            }
            console.error('Error config:', error.config);

            console.log(file_url)
            console.log(file_path)
            console.log(err);
          });
    }


    firebaseReleaseVersion = async versionToUpdate => {
        ipcRenderer.invoke("log", { message: "firebaseReleaseVersion 1:" , source: "_RP", event: "firebaseReleaseVersion" })
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
            ipcRenderer.invoke('status-message', {"message": `Checking update info for ${this.name}...`})
            ipcRenderer.invoke("log", { message: `Checking update info for ${this.name}...`, source: "_RP", event: "_RP" })
            const resp = await fetch(this.remotePath)
            ipcRenderer.invoke("log", { message: `GitHub response status: ${resp.status}...`, source: "_RP", event: "_RP" })

            ipcRenderer.invoke("log", { message: `Checked update info for ${this.name}...`, source: "_RP", event: "_RP" })
            const data = await resp.json()
            ipcRenderer.invoke("log", { message: `All-releases data collected for ${this.name}...` , source: "_RP", event: "_RP" })
            this.versions = data.map(i => ({
                [i.tag_name]: i
            }))
            
            this.version = versionToUpdate === undefined ?
                semverMaxSatisfying(this.versions.map(i => Object.keys(i)[0]), "*") :
                versionToUpdate
                ipcRenderer.invoke("log", { message: "gitReleaseVersion asar URL:"+this.remotePath+" ver:"+this.version , source: "_RP", event: "_RP" })
            
            this.details = this.versions.find(i => Object.keys(i)[0] === this.version)[this.version]
        } catch (e) {
            ipcRenderer.invoke("log", { message: `fetching details failed for ${this.name}...` , source: "_RP", event: "_RP" })
            ipcRenderer.invoke("log", { message: "fetch error:"+e.message , source: "_RP", event: "_RP" })
            //console.warn('gitReleaseVersion error', e)
            this.version = '0.0.0'
            this.details = {}
        }
        ipcRenderer.invoke("log", { message: `${this.name} ver: ${this.version} to be checked against the local version...` , source: "_RP", event: "_RP" })
    }

    firebaseReleaseAsarInstall = async () => {
        ipcRenderer.invoke("log", { message: "firebaseReleaseAsarInstall 1:" , source: "_RP", event: "firebaseReleaseAsarInstall" })
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
            ipcRenderer.invoke("log", { message: `gitReleaseAsarInstall: Downloading ${this.name} ver:${this.version}` , source: "_RP", event: "_RP" })
            await this.fileDownloadAndSave(fileUrl, asarPath)
            ipcRenderer.invoke("log", { message: `gitReleaseAsarInstall: Downloaded ${this.name} ver:${this.version}` , source: "_RP", event: "_RP" })
            const pkg = require(normalize(join(asarPath, 'package.json')))
            return this.checkVersionAndUpdateFile(pkg, asarPath)
        } catch (e) {
            ipcRenderer.invoke('status-message', {"message": `No updates for ${this.name}`})
            ipcRenderer.invoke("log", { message: `gitReleaseAsarInstall: Error in asar download OR checkversion for ${this.name} ver:${this.version}` , source: "_RP", event: "_RP" })
            ipcRenderer.invoke("log", { message: `gitReleaseAsarInstall: Error: ${e.message}` , source: "_RP", event: "_RP" })

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
        ipcRenderer.invoke("log", { message: "getRemoteDetails:" , source: "_RP", event: "getRemoteDetails" })
        await this.typeMapping[this.storage][this.sourceType](versionToUpdate)
    }

}

module.exports = RemotePackage
