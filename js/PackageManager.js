const fs = require("fs");
const {normalize} = require("path");
const {initializeApp} = require("firebase/app");
const {getFirestore, query, collection, doc, where, getDocs, getDoc} = require("firebase/firestore");
const {getAuth, signInAnonymously, signInWithCustomToken} = require("firebase/auth");
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

    get availableModules() {
        return sessionStore.get('moduleAvailableVersions')
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
            if ( Object.keys(sessionStore.get('moduleAvailableVersions')).indexOf(i.name) > -1 || ['local', 'dev'].indexOf(i.storage) > -1 ) {
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
            }
        })
    }


    async updateOnePackage(module, versionToUpdate = undefined) {
        const availableVersions = this.availableModules[module.name]
        console.log(availableVersions)
        const LP = new LocalPackage(module, availableVersions)
        const restartNeeded = await LP.update(this.isOffline, versionToUpdate)
        sessionStore.set('restartNeeded', restartNeeded)
        return restartNeeded
    }

    mergeModules() {
        const modules = sessionStore.get('modulesContent', {})
        sessionStore.delete('modulesContent')
        for (let module_name of Object.keys(this.availableModules)) {
            if (modules[module_name] != undefined) {
                continue
            }
            const module_data = Object.values(this.availableModules[module_name])[0]
            if (module_data.moduleMeta?.update !== 'auto') {
                continue
            }
            modules[module_name] = {
                "name": module_data.name,
                "group": module_data.group,
                "minBSkyVersion": module_data.minBSkyVersion,
                "minAppVersion": module_data.minAppVersion,
                ...module_data.moduleMeta
            }
        }
        sessionStore.set('modulesContent', modules)
    }

    async updatePackages(group = undefined, except = undefined) {
        await ipcRenderer.invoke('status-message', {"message": "Checking for updates..."})
        sessionStore.set('restartNeeded', false)
        let restartNeeded = false

        for (let module of Object.values(this.modules)) {
            if (module.update === 'auto') {
                if (group && module.group !== group) {
                    continue
                }
                if (except && module.group === except) {
                    continue
                }
                const restartFlag = await this.updateOnePackage(module)
                restartNeeded = restartFlag || restartNeeded
            }
        }
        await ipcRenderer.invoke('status-message', {"message": "Update check is done ..."})
        sessionStore.set('restartNeeded', restartNeeded)
        return restartNeeded
    }


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

    // We need to add modules from available modules to modules.json
    getUpdateMeta = async (force_update = false) => {
        if (this.isOffline) {
            return
        }
        if (!force_update) {
            if (this.availableModules) {
                return this.availableModules
            }
        }
        await ipcRenderer.invoke('status-message', {"message": "Fetching update meta..."})
        const user = store.get('user', {isAnonymous: true})
        store.delete('user', user)
        const appVersion = sessionStore.get('version', null)
        const bSkyVersion = store.get("BSkyVersion") || null
        const app = initializeApp(sessionStore.get("firebaseConfig"))
        const auth = getAuth(app)
        const db = getFirestore(app)
        user.subscriptions = ['public']
        if (!user.isAnonymous) {
            try {
                await signInWithCustomToken(auth, user.customToken)
                const docRef = doc(db, 'subscriptions', user.email)
                const result = await getDoc(docRef)
                for (const i of result.data().activeSubscriptions) {
                    user.subscriptions.push(i.planName)
                }
                if (user.subscriptions.indexOf('public') === -1) { 
                    user.subscriptions.push('public')
                }
                user.subscriptions = user.subscriptions.sort()
            } catch (ex) { 
                console.error(ex.trace)
            }
        }
        store.set('user', user)
        const q = query(
            collection(db, 'modules_cache'),
            where('subscriptions', '==', user.subscriptions.join(':') ), //todo: pass user subscriptions
            where('minAppVersion', '==', appVersion),
            where('minBSkyVersion', '==', bSkyVersion),
        )

        try {
            const results = await getDocs(q)
            const docData = results.docs && results.docs[0]?.data()
            if (docData) {
                const {modules} = docData
                console.log('getUpdateMeta', modules)
                sessionStore.set('moduleAvailableVersions', modules)
                return modules
            } else {
                const body = user?.email ? {'user': user} : {'subscriptions': ['public']}
                body.clientAppVersion = appVersion
                body.bSkyVersion = bSkyVersion
                const resp =  await fetch(configStore.get('packageURL'), {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(body)
                })
                if (resp.ok) {
                    const result = await resp.json()
                    sessionStore.set('moduleAvailableVersions', result)
                    return result
                }
            }
        } catch (e) {
            console.error(e)
        }
        sessionStore.set('moduleAvailableVersions', {})
        return {}
    }
}


module.exports = PackageManager