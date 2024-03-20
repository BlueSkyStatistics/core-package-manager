var path = require('path')
const gt = require('semver').gt

try {
    var LocalPackage = require("./LocalPackage")
    var RemotePackage = require("./RemotePackage")
    var {packageUpdateVersionInstalledMessage, updateModule} = require("./handlers");
    var firebaseClient = require("./clients/firebaseClient")
} catch(er) {
    var LocalPackage = require(path.normalize(__dirname + "/LocalPackage"));
    var RemotePackage = require(path.normalize(__dirname + "/RemotePackage"));
    var {packageUpdateVersionInstalledMessage, updateModule} = require(path.normalize(__dirname + "/handlers"));
    var firebaseClient = require(path.normalize(__dirname + "/clients/firebaseClient"))
}


// ipcRenderer.on('versionUpdateError', (event, message) => {
//     ipcRenderer.invoke('bsevent', {event: 'errormessage', data: { title: "Package Update Error", message: message }})
// })

const {sessionStore} = global

class PackageManager {
    constructor() {
        this.modules = sessionStore.get("modulesContent")
    }

    init() {
        if ( sessionStore.get("installedPackages") == undefined ) {
            //following is removed from v10.3.4, because sendSync() seeems to cause slowness or hang on splash screen (or maybe background process)
            //instead newSendSync is used which seems to hold up well
            // ipcRenderer.sendSync("bsevent", {'event': 'listInstalled'})
        }
        this.firebaseClient = undefined
        if (sessionStore.get("firebaseConfig")) {
            this.firebaseClient = new firebaseClient(sessionStore.get("firebaseConfig"), sessionStore.get('firebaseBucket'))
        }
    }

    async newSendSync(params) {
        try {
            const result = await ipcRenderer.invoke("listInstalled", {});
            ipcRenderer.invoke("log", { message: "newSendSync: result..."+result , source: "_PM", event: "updatePackages" })
            return result;
          } catch (error) {
            console.error('Error in synchronous IPC:', error);
            throw error;
          }
    }
    async createRpkgList() {
        try {
            ipcRenderer.invoke('status-message', {"message": "Creating package list..."})
          const data = await this.newSendSync('fetch-data');
          ipcRenderer.invoke("log", { message: "createRpkgList: resultdata..."+data , source: "_PM", event: "updatePackages" })
        return data;
        } catch (error) {
          console.error('Error fetching data:', error);
        }
      }


    importInit() {
        this.modules.init?.forEach(i =>
            new LocalPackage(i).importAllFromPackage()
        )
    }

    importPackages() {
        // To avoid async and be prepared for app launch we import whatever we have
        this.modules.core.forEach(i =>
            new LocalPackage(i).importAllFromPackage()
        )
    }

    addExtensions() {
        this.modules.extentions.forEach(i =>
            new LocalPackage(i).requirePackage()
        )
    }

    async updateOnePackage(module, versionToUpdate = undefined) {
        let restartNeeded = false

        let _localPackage = new LocalPackage(module)
        if (_localPackage.version === '0.0.0' ) {
            // We have no local package, so we copy it
            if (_localPackage.copyFromInstaller()) {
                restartNeeded = true
                _localPackage = new LocalPackage(module)
            }
        }
        if (_localPackage.sourceType === 'local') {
            if ( gt(_localPackage.getInstallerVersion(), _localPackage.version)) {
                restartNeeded = _localPackage.copyFromInstaller()
            }
            if (!sessionStore.get("restartNeeded") && restartNeeded) {
                sessionStore.delete("restartNeeded")
                sessionStore.set("restartNeeded", true)
                return
            }
        }
        
        if (configStore.get("offline")) {
            return 
        }
        const _remotePackage = new RemotePackage(module, this.firebaseClient)
        await _remotePackage.getRemoteDetails(versionToUpdate)
        switch (module.update) {
            case 'auto':
                if (gt(_remotePackage.version, _localPackage.version)) {
                    restartNeeded = restartNeeded || await _remotePackage.installPackage()
                }
                else {
                    ipcRenderer.invoke("log", { message: `Remote version of ${module.name} is not greater than the local (when update:auto)` , source: "_PM", event: "updateOnePackages" })
                }
                break
            case 'manual':
                if (versionToUpdate !== undefined) {
                    restartNeeded = restartNeeded || await _remotePackage.installPackage()
                }
                ipcRenderer.invoke('core-module-update-available', module)
                break
            default:
                ipcRenderer.invoke("log", { message: `local ${module.name} ` , source: "_PM", event: "updateOnePackages" })
                console.warn('Update mode unknown: ', module.update, "module name:",module.name)
                break
        }

        if (!sessionStore.get("restartNeeded") && restartNeeded) {
            sessionStore.delete("restartNeeded")
            sessionStore.set("restartNeeded", true)
        }
        ipcRenderer.invoke("log", { message: `restart-needed : ${restartNeeded} for ${module.name}` , source: "_PM", event: "updateOnePackages" })
        return restartNeeded
    }

    async updatePackages() {
        ipcRenderer.invoke("log", { message: "updatePackages:before creating package list..." , source: "_PM", event: "updatePackages" })
        ipcRenderer.invoke('status-message', {"message": "before creating package list..."})

        if ( sessionStore.get("installedPackages") == undefined ) {
            const res = await this.createRpkgList()
            ipcRenderer.invoke("log", { message: "updatePackages:after creating package list...resultRes="+res , source: "_PM", event: "updatePackages" })
        }
        else {
            ipcRenderer.invoke("log", { message: "updatePackages:ELSE installedPackages is already present..." , source: "_PM", event: "updatePackages" })
        }

        ipcRenderer.invoke("log", { message: "updatePackages:after creating package list..." , source: "_PM", event: "updatePackages" })
        ipcRenderer.invoke('status-message', {"message": "after creating package list..."})
        ipcRenderer.invoke("log", { message: "updatePackages:Checking for updates..." , source: "_PM", event: "updatePackages" })
        ipcRenderer.invoke('status-message', {"message": "Checking for updates..."})
        sessionStore.delete("restartNeeded")
        sessionStore.set("restartNeeded", false)
        ipcRenderer.invoke("log", { message: "updatePackages:after restartNeeded..." , source: "_PM", event: "updatePackages" })
        for (var module of this.modules.core) {
            module.moduleType = 'core'
            ipcRenderer.invoke("log", { message: "updatePackages:before core-updateOnePackage..." , source: "_PM", event: "updatePackages" })
            await this.updateOnePackage(module)
            ipcRenderer.invoke("log", { message: "updatePackages.:after core-updateOnePackage..." , source: "_PM", event: "updatePackages" })
        }
        for (const dialog of this.modules.dialogs) {
            module.moduleType = 'dialogs'
            ipcRenderer.invoke("log", { message: "updatePackages:before dialogs-updateOnePackage..." , source: "_PM", event: "updatePackages" })
            await this.updateOnePackage(dialog)
            ipcRenderer.invoke("log", { message: "updatePackages:after dialogs-updateOnePackage..." , source: "_PM", event: "updatePackages" })
        }
        ipcRenderer.invoke('status-message', {"message": "Update check is done ..."})
        ipcRenderer.invoke("log", { message: "updatePackages.:Update check is done ......" , source: "_PM", event: "updatePackages" })
        return sessionStore.get("restartNeeded")
    }

    async getPackagesVersions() {
        // let modules = PackageManager.getModulesMeta()
        const process_package = async (package_item, additional_data = {}) => {
            const {name, version, description} = new LocalPackage(package_item)
            var _remotePackage;
            package_item.moduleType = additional_data.type
            if (configStore.get("offline")) {
                _remotePackage = {versions: [{name: version}]}
            } else {
                ipcRenderer.invoke('status-message', {
                    message: `Checking version of ${package_item.name} ...`,
                    nomain: true
                })
                _remotePackage = new RemotePackage(package_item, this.firebaseClient)
                ipcRenderer.invoke("log", { message: `getPackagesVersions: for ${package_item.name}` , source: "_PM", event: "_PM" })
                await _remotePackage.getRemoteDetails()
            }
            
            return {
                name, version, description,
                available: _remotePackage.versions,
                ...additional_data
            }
        }

        const coreModulesVersions = await Promise.all(this.modules.core.map(async i => await process_package(i, {type: "core"})))
        const dialogModulesVersions = await Promise.all(this.modules.dialogs.map(async i => await process_package(i, {type: "dialogs"})))
        return [...coreModulesVersions, ...dialogModulesVersions]
    }

    findModule = (moduleType, moduleName) =>
        this.modules[moduleType]?.find(
            m => m.name === moduleName
        )

    handleMarketUpdateClick = async el => {
        const {moduleType, module: moduleName, version: currentVersion} = el.dataset
        const selectedVersion = $(el).siblings('select.versionsSelect').val()
        if (selectedVersion === currentVersion) {
            new BSEvent('notify').emit(packageUpdateVersionInstalledMessage)
        } else {
            const module = this.findModule(moduleType, moduleName)
            await updateModule(this, module, selectedVersion)
        }
    }

}


module.exports = PackageManager