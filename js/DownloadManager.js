const axios = require('axios')
const {maxSatisfying: semverMaxSatisfying, lte: semverLte, satisfies: semverSatisfies} = require('semver')
const {Render} = require('squirrelly')
const {writeFileSync, copyFileSync, unlink} = require('original-fs')
const {normalize, join} = require("path")
const path = require("path");
const {sessionStore} = global


class DownloadClient {
    constructor(updateMeta) {
        this.meta = updateMeta
        const {name, artifactType} = this.meta
        const tmpDir = normalize(join(sessionStore.get('userData'), 'tmp'))
        this.tmpFilePath = normalize(join(tmpDir, `${name}.${artifactType}`))
    }

    downloadPackage() {
        // return bool
        throw new Error('Method downloadPackage must be implemented')
    }
}

class FirebaseDownloadClient extends DownloadClient {
    static firebaseClient = undefined

    constructor(updateMeta) {
        super(updateMeta)
        // updateMeta = {
        //     "productName": "firebase_test",
        //     "requiredPackages": [],
        //     "main": "index.js",
        //     "keywords": [],
        //     "subscriptions": [
        //         "public"
        //     ],
        //     "author": "aspect13",
        //     "repository": {},
        //     "homepage": "https://www.blueskystatistics.com",
        //     "moduleMeta": {
        //         "artifactType": "asar",
        //         "removable": true,
        //         "storage": "firebase",
        //         "update": "manual",
        //         "extra": {
        //             "remote": "BlueSkyStatistics/core-auth-manager",
        //             "sourceType": "release"
        //         },
        //         "path": "{{locals}}/core-auth-manager.asar"
        //     },
        //     "dependencies": {},
        //     "publishConfig": {
        //         "registry": "https://npm.pkg.github.com"
        //     },
        //     "minBSkyVersion": null,
        //     "description": "firebase_test",
        //     "devDependencies": {
        //         "asar": "^3.2.0"
        //     },
        //     "bugs": {
        //         "url": "https://github.com/BlueSkyStatistics/BlueSkyJS/issues"
        //     },
        //     "minAppVersion": null,
        //     "license": "AGLPL",
        //     "scripts": {}
        // }
        const {name, subscriptions} = updateMeta
        this.name = name
        this.subscriptions = subscriptions
        this.initClient()
    }

    get client() {
        return FirebaseDownloadClient.firebaseClient
    }

    initClient = () => {
        if (sessionStore.get('firebaseConfig')) {
            if (!this.client) {
                let FirebaseClient
                try {
                    FirebaseClient = require('./clients/firebaseClient')
                } catch (er) {
                    FirebaseClient = require(path.normalize(__dirname + '/clients/firebaseClient'))
                }
                FirebaseDownloadClient.firebaseClient = new FirebaseClient(
                    sessionStore.get('firebaseConfig'),
                    sessionStore.get('firebaseBucket')
                )
            }
        } else {
            throw new Error('firebaseConfig not found in sessionStore. Cannot download from firebase')
        }
    }

    downloadPackage = async () => {
        for (const sub of this.subscriptions) {
            const storagePath = [sub, this.name].join('/')
            console.log('downloadPackage', {storagePath})
            const downloaded = await this.client.downloadFile(storagePath, this.tmpFilePath)
            if (downloaded) {
                return true
            }
        }
        return false
    }
}

class GithubDownloadClient extends DownloadClient {

    constructor(updateMeta) {
        super(updateMeta)
        this.downloadUrl = `https://api.github.com/repos/${this.remote}/releases`

    }

    downloadPackage = async () => {
        console.log('downloadPackage', {url: this.downloadUrl})
        try {
            const resp = await axios.get(this.downloadUrl, {responseType: "arraybuffer"})
            writeFileSync(normalize(this.tmpFilePath), Buffer.from(resp.data))
        } catch (e) {
            console.error(e)
            return false
        }
        return true
    }
}

class DownloadManager {
    constructor(moduleData, installationPath) {
        this.moduleData = moduleData
        this.installationPath = installationPath
        this.name = moduleData.name
        this.main = moduleData.main
        const {moduleMeta} = moduleData
        this.artifactType = moduleMeta.artifactType
        this.storage = moduleData.storage
    }

    getDownloadClient() {
        switch (this.storage) {
            case 'firebase':
                return new FirebaseDownloadClient(this.moduleData)
            case 'github':
                return new GithubDownloadClient(this.moduleData)
            default:
                console.error('Download client is not implemented for storage type', this.storage)
            // throw new Error(`Download client is not implemented for storage type: ${this.storage}`)
        }
    }

    installPackage = async () => {
        let updateSuccess = false
        const dlClient = this.getDownloadClient()
        if (!dlClient) {
            return updateSuccess
        }
        try {
            await dlClient.downloadPackage()
            const meta = require(normalize(join(dlClient.tmpFilePath, 'package.json')))
            updateSuccess = checkVersionAndUpdateFile(meta, dlClient.tmpFilePath, this.installationPath)
        } catch (e) {
            // console.warn({fullPath, asarPath})
            console.warn(e)
        }
        return updateSuccess
    }
}

const satisfyVersion = pkgName => {
    const installedPackages = sessionStore.get("installedPackages")
    return installedPackages.hasOwnProperty(
        Object.keys(pkgName)[0]) && semverSatisfies(
        installedPackages[Object.keys(pkgName)[0]],
        Object.values(pkgName)[0]
    )
}

const checkVersionAndUpdateFile = (meta, srcPath, dstPath) => {
    const {name, minBSkyVersion, requiredPackages} = meta
    const installedBSkyVersion = sessionStore.get("version")
    const errors = []
    if (!(
        minBSkyVersion === undefined ||
        // adding .0 because BSky versions are done with only 2 digits
        semverLte(`${minBSkyVersion}.0`, `${installedBSkyVersion}.0`)
    )) {
        errors.push(`package ${this.name} requires BSky R Package version: ${minBSkyVersion} but current version is ${installedBSkyVersion})`)
    }
    requiredPackages?.forEach(item => {
        if (!satisfyVersion(item)) {
            errors.push(`required R Package ${Object.keys(item)[0]} version: ${Object.values(item)[0]} but current version is ${sessionStore.get("installedPackages")[item[0]]}`)
        }
    })
    if (errors.length === 0) {
        ipcRenderer.invoke('status-message', {"message": `"Updating ${name}...`})
        copyFileSync(normalize(srcPath), dstPath)
    } else {
        ipcRenderer.invoke('bsevent', {'event': 'versionUpdateError', 'data': errors.join('\n')})
    }
    // deleteFile(filepath)
    // delete require.cache[path.join(filepath, 'package.json')]
    delete require.cache[normalize(join(srcPath, 'package.json'))]
    unlink(normalize(srcPath), err => err && console.log(err))
    return errors.length === 0
}

// }

module.exports = DownloadManager
