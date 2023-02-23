const fs = require('fs');
const path = require('path');
const ipcRenderer = require('electron').ipcRenderer;

const Store = require('electron-store');
const sessionStore = new Store({name:`constants`});
const remotePackage = require('../RemotePackage');
const localPackage = require('../LocalPackage');
const {PackageManager} = require("../../index");

const gt = require('semver').gt

ipcRenderer.on('versionUpdateError', (event, message) => {
    ipcRenderer.invoke('bsevent', {event: 'errormessage', data: { title: "Package Update Error", message: message }})
})

class PackageUpdater {
    constructor() {
        sessionStore.delete("modules")
        ipcRenderer.invoke("listInstalled")
        this.modules = PackageUpdater.getModulesMeta()
        sessionStore.set("modules", this.modules)
    }

    importPackages() {
        // To avoid async and be prepared for app launch we import whatever we have
        this.modules.core.forEach(i => new localPackage(i).importAllFromPackage())
    }

    addExtensions() {
        this.modules.extentions.forEach(i =>
            new localPackage(i).requirePackage()
        )
    }

    async updateOnePackage(module, versionToUpdate=undefined) {
        let restartNeeded = false
        let _localPackage = new localPackage(module)
        if (_localPackage.version === '0.0.0' ) {
            // We have no local package, so we copy it
            if (_localPackage.copyFromInstaller()) {
                _localPackage = new localPackage(module)
                restartNeeded = true

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

        var _remotePackage = new remotePackage(module)
        await _remotePackage.getRemoteDetails(versionToUpdate)
        if (module.update == 'auto') {
            if ( gt(_remotePackage.version, _localPackage.version)) {
                restartNeeded = await _remotePackage.installPackage()
            }
        } else if (module.update == 'manual') {
            if (versionToUpdate != undefined)   {
                restartNeeded = await _remotePackage.installPackage()
            } else {
                ipcRenderer.invoke('core-module-update-available', module)
            }
        }
        if (!sessionStore.get("restartNeeded") && restartNeeded) {
            sessionStore.delete("restartNeeded")
            sessionStore.set("restartNeeded", true)
        }
    }

    async updatePackages() {
        ipcRenderer.invoke('status-message', {"message": "Checking for updates..."})
        sessionStore.delete("restartNeeded")
        sessionStore.set("restartNeeded", false)
        for (var i=0; i < this.modules.core.length; i++) {
            await this.updateOnePackage(this.modules.core[i])
        }
        for (var i=0; i < this.modules.dialogs.length; i++) {
            await this.updateOnePackage(this.modules.dialogs[i])
        }
        ipcRenderer.invoke('status-message', {"message": "Update check is done ..."})

        return sessionStore.get("restartNeeded")
    }

    // static getLocalModulesMeta() {
    //     return JSON.parse(fs.readFileSync(path.join(sessionStore.get("appRoot").replace("app.asar", ""), "modules.json"), 'utf8'))
    // }
    static getModulesMeta() {
        return JSON.parse(fs.readFileSync(store.get("modulespath"), 'utf8'))
    }

    static async getPackagesVersions() {

        let modules = PackageManager.getModulesMeta()

        const process_package = async (package_item, additional_data = {}) => {
            ipcRenderer.invoke('status-message', {
                message: `Checking version of ${package_item.name} ...`,
                nomain: true
            })
            const _remotePackage = new remotePackage(package_item)
            await _remotePackage.getRemoteDetails()
            const {name, version, description} = new localPackage(package_item)
            return {
                name, version, description,
                available: _remotePackage.versions,
                ...additional_data
            }
        }

        const coreModulesVersions = await Promise.all(modules.core.map(async i => await process_package(i, {type: "core"})))
        const dialogModulesVersions = await Promise.all(modules.dialogs.map(async i => await process_package(i, {type: "dialogs"})))
        return [...coreModulesVersions, ...dialogModulesVersions]
    }
}


module.exports = {
    localPackage: localPackage,
    remotePackage: remotePackage,
    PackageUpdater: PackageUpdater
}