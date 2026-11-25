/**
  * This file is protected by copyright (c) 2023-2025 by BlueSky Statistics, LLC.
  * All rights reserved. The copy, modification, or distribution of this file is not
  * allowed without the prior written permission from BlueSky Statistics, LLC.
 */

const {maxSatisfying: semverMaxSatisfying, lte: semverLte, satisfies: satisfyVer} = require('semver')
const {Render} = require('squirrelly')
const {normalize, join, parse} = require("path")
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
    constructor({name, path, importpath, storage, artifactType, sourceType, remote, update, removable, moduleType}, firebaseClient) {
        this.userDataPath = sessionStore.get("userData")
        this.appRoot = sessionStore.get("appRoot")
        this.firebaseClient = firebaseClient

        this.name = name
        this.moduleType = moduleType
        this._path = path
        this.path = normalize(Render(this._path, {
            locals: this.userDataPath,
        }))
        
        this.storage = storage
        this.artifactType = artifactType
        this.sourceType = sourceType
        this.remote = remote?.trim()
        this.remotePath = normalize(Render(this.urlMapped[this.storage], {repo: this.remote}))

        this.update = update
        this.removable = removable
        this.version = '0.0.0'
        this.description = ""

        this.details = {}
        this.versions = []
    }

    checkVersionAndUpdateFile = async (pkg, filepath) => {
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
        // The main process downloaded the package next to its place; it puts it in place, or deletes it when
        // the checks above failed (BlueSkyJS Phase 2.3)
        const request = {name: this.name, moduleType: this.moduleType, version: this.version}
        let applied = false
        if (errors.length === 0) {
            ipcRenderer.invoke('status-message', {"message": `Applying updates for ${this.name}...`})
            try{
                await ipcRenderer.invoke('packages:apply', request)
                applied = true
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
        if (!applied) {
            try {
                await ipcRenderer.invoke('packages:discard', request)
            } catch (err) {
                ipcRenderer.invoke("log", { message: `discarding the download failed: ${err.message}` , source: "_RP", event: "_RP" })
            }
        }

        // update check finished (does not matter applied or not, but check is done)
        ipcRenderer.invoke('status-message', {"message": `Update check finished for ${this.name}...`})
        ipcRenderer.invoke("log", { message: `Update check finished for ${this.name}...` , source: "_RP", event: "_RP" })

        return applied
    }

    firebaseReleaseVersion = async versionToUpdate => {
        ipcRenderer.invoke("log", { message: "firebaseReleaseVersion 1:" , source: "_RP", event: "firebaseReleaseVersion" })
        try {
            var data = await this.firebaseClient?.getPackageVersions(this.remotePath) || []
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
        const formattedName = `${parse(this.path).name}_${this.version}.asar`
        const formattedPath = parse(this.path).dir
        const asarPath = join(formattedPath, formattedName)
        // console.log(fullPath)
        try {
            await this.firebaseClient?.downloadFile(fullPath, asarPath)
            const pkg = require(normalize(join(asarPath, 'package.json')))
            return this.checkVersionAndUpdateFile(pkg, asarPath)
        } catch (e) {
            console.warn({fullPath, asarPath})
            console.warn(e)
        }
        return false
    }


    // The main process downloads the release (it works out the URL from the modules list), checks its
    // SHA-256 against the one GitHub publishes and writes it next to the package (BlueSkyJS Phase 2.3)
    gitReleaseAsarInstall = async () => {
        try {
            ipcRenderer.invoke("log", { message: `gitReleaseAsarInstall: Downloading ${this.name} ver:${this.version}` , source: "_RP", event: "_RP" })
            ipcRenderer.invoke("status-message", {"message": `Downloading ${this.name}...`})
            const {asarPath, pkg, verified, warning} = await ipcRenderer.invoke("packages:download", {name: this.name, moduleType: this.moduleType, version: this.version})
            ipcRenderer.invoke("log", { message: `gitReleaseAsarInstall: Downloaded ${this.name} ver:${this.version} (${verified ? "checksum verified" : warning || "no checksum"})` , source: "_RP", event: "_RP" })
            return await this.checkVersionAndUpdateFile(pkg, asarPath)
        } catch (e) {
            ipcRenderer.invoke("status-message", {"message": `No updates for ${this.name}`})
            ipcRenderer.invoke("log", { message: `gitReleaseAsarInstall: Error in asar download OR checkversion for ${this.name} ver:${this.version}` , source: "_RP", event: "_RP" })
            ipcRenderer.invoke("log", { message: `gitReleaseAsarInstall: Error: ${e.message}` , source: "_RP", event: "_RP" })
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
            local: () => {},
            release: () => {}
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
