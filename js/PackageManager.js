const fs = require("fs");
const {normalize} = require("path");
const {initializeApp} = require("firebase/app");
const {getFirestore, query, collection, where, getDocs} = require("firebase/firestore");
const {maxSatisfying: semverMaxSatisfying} = require("semver");
const {packageUpdateSuccessMessage} = require("./handlers");
const gt = require('semver').gt

let LocalPackage
try {
    LocalPackage = require("./LocalPackage")
    var {packageUpdateVersionInstalledMessage, updateModule} = require("./handlers");
    // var firebaseClient = require("./clients/firebaseClient")
} catch(er) {
    LocalPackage = require(normalize(__dirname + "/LocalPackage"));
    var {packageUpdateVersionInstalledMessage, updateModule} = require(normalize(__dirname + "/handlers"));
    // var firebaseClient = require(normalize(__dirname + "/clients/firebaseClient"))
}


// ipcRenderer.on('versionUpdateError', (event, message) => {
//     ipcRenderer.invoke('bsevent', {event: 'errormessage', data: { title: "Package Update Error", message: message }})
// })

const {sessionStore, configStore} = global

class PackageManager {

    get modules() {
        return sessionStore.get('modulesContent', {})
    }

    get isOffline() {
        return configStore.get('offline', false)
    }

    get packageURL() {
        return configStore.get('packageURL', '')
    }

    constructor() {
        // this.modules =
        // sessionStore.delete('moduleAvailableVersions')
        // this.isOffline = configStore.get('offline', false)
        // this.getUpdateMeta().then(updateMeta => console.log('this will be the update meta', updateMeta))
        this.availableModules = {}

        !this.isOffline && this.getUpdateMeta().then(res => {
            this.availableModules = res
        })
        // this.firebaseClient = undefined
    }

    init() {
        if ( sessionStore.get("installedPackages") === undefined ) {
            ipcRenderer.sendSync("bsevent", {'event': 'listInstalled'})
        }
    }

    importInit() {
        Object.values(this.modules).forEach(i =>
            i.group === 'init' && new LocalPackage(i).importAllFromPackage()
        )
    }

    importPackages(group = undefined, except = undefined) {
        // To avoid async and be prepared for app launch we import whatever we have
        // this.modules.core.forEach(i =>
        //     new LocalPackage(i).importAllFromPackage()
        // )
        Object.values(this.modules).forEach(i => {
            if (group && i.group !== group) {
                return
            } 
            if (except && i.group == except) {
                return
            }
            switch (i.group) {
                case 'core':
                    new LocalPackage(i).importAllFromPackage()
                    break
                case 'dialogs':
                    new LocalPackage(i).importAllFromPackage()
                    break
                case 'extensions':
                    new LocalPackage(i).requirePackage()
                    break
            }
        })
    }

    // addExtensions() {
    //     this.modules.extentions.forEach(i =>
    //         new LocalPackage(i).requirePackage()
    //     )
    // }

    // getAvailableVersions = module => {
    //     // const updateMeta = await this.getUpdateMeta()
    //     const groupData = this.availableModules[module.group]
    //     if (!groupData) {
    //         return {}
    //     }
    //     return groupData[module.name]
    // }

    // getModuleVersionMeta = async (moduleName, moduleVersion, moduleGroup) => {
    //     // const updateMeta = await this.getUpdateMeta()
    //     if (!this.availableModules[moduleGroup]) {
    //         return null
    //     }
    //     if (!this.availableModules[moduleGroup][moduleName]) {
    //         return null
    //     }
    //     return this.availableModules[moduleGroup][moduleName][moduleVersion] || null
    // }


    async updateOnePackage(module, versionToUpdate = undefined) {
        const availableVersions = this.availableModules[module.name]
        console.log(availableVersions)
        const LP = new LocalPackage(module, availableVersions)
        const restartNeeded = await LP.update(this.isOffline, versionToUpdate)
        sessionStore.set('restartNeeded', restartNeeded)
        return restartNeeded
    }

    async updatePackages(group = undefined, except = undefined) {
        ipcRenderer.invoke('status-message', {"message": "Checking for updates..."})
        sessionStore.set('restartNeeded', false)
        let restartNeeded = false

        for (let module of Object.values(this.modules)) {
            if (module.update === 'auto') {
                if (group && module.group !== group) {
                    continue
                }
                if (except && module.group == except) {
                    continue
                }
                const restartFlag = await this.updateOnePackage(module)
                restartNeeded = restartFlag || restartNeeded
            }
        }
        ipcRenderer.invoke('status-message', {"message": "Update check is done ..."})
        sessionStore.set('restartNeeded', restartNeeded)
        return restartNeeded
    }


    //     // let modules = PackageManager.getModulesMeta()
    //     const process_package = async (package_item, additional_data = {}) => {
    //         const localPackage = new LocalPackage(package_item)
    //         const {name, version, description} =
    //         var _remotePackage;
    //         package_item.moduleType = additional_data.type
    //         if (this.isOffline) {
    //             _remotePackage = {versions: [{name: version}]}
    //         } else {
    //             ipcRenderer.invoke('status-message', {
    //                 message: `Checking version of ${package_item.name} ...`,
    //                 nomain: true
    //             })
    //             _remotePackage = new RemotePackage(package_item, this.firebaseClient)
    //             await _remotePackage.getRemoteDetails()
    //         }
    //
    //         return {
    //             name, version, description,
    //             available: _remotePackage.versions,
    //             ...additional_data
    //         }
    //     }
    //
    //     const coreModulesVersions = await Promise.all(this.modules.core.map(async i => await process_package(i, {type: "core"})))
    //     const dialogModulesVersions = await Promise.all(this.modules.dialogs.map(async i => await process_package(i, {type: "dialogs"})))
    //     return [...coreModulesVersions, ...dialogModulesVersions]
    // }


    handleMarketUpdateClick = async el => {
        const {name, version, group} = el.dataset
        const selectedVersion = $(el).siblings('select.versionsSelect').val()
        if (selectedVersion === version) {
            try {
                new BSEvent('notify').emit(packageUpdateVersionInstalledMessage)
            } catch (e) {

            }
        } else {
            const module = this.modules[name]
            const restartNeeded = await this.updateOnePackage(module, selectedVersion)
            restartNeeded && new BSEvent('notify').emit(packageUpdateSuccessMessage)
        }
    }

    getUpdateMeta = async (force_update = false) => {
        if (!force_update) {
            const savedUpdateMeta = sessionStore.get('moduleAvailableVersions')
            if (savedUpdateMeta) {
                return savedUpdateMeta
            }
        }
        // const modulesPath = sessionStore.get("modulespath", "./modules.json")
        // const modulesMeta = JSON.parse(fs.readFileSync(normalize(modulesPath), 'utf8'))
        if (this.isOffline) {
            // sessionStore.set('modules', modulesMeta)
            return sessionStore.get('moduleAvailableVersions', {})
        }
        const user = store.get('user')
        const app = initializeApp(sessionStore.get("firebaseConfig"))
        const db = getFirestore(app)
        const q = query(
            collection(db, 'modules_cache'),
            where('subscriptions', 'array-contains-any', ['public']), //todo: pass user subscriptions
            where('minAppVersion', '==', null),
            where('minBSkyVersion', '==', null),
        )
        // todo: fetch func url if collection undefined
        // const resp = await fetch(
        //     `https://querymodules-vzofyvikba-uc.a.run.app?clientAppVersion=${null},bSkyVersion=${null}`,
        //     )
        // const modules = await resp.json()
        try {
            const results = await getDocs(q)
            console.log(results)
            results.forEach(module => {
                const meta = module.data()
                const {modules} = meta
                // sessionStore.set('modules', modulesMeta)
                console.log('getUpdateMeta', modules)
                sessionStore.set('moduleAvailableVersions', modules)
                return modules
            })

        } catch (e) {
            console.error(e)
        }
        return {}
    }

}


module.exports = PackageManager