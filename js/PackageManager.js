const fs = require('fs')
const path = require('path')
const ipcRenderer = require('electron').ipcRenderer

const Store = require('electron-store')
const LocalPackage = require("./LocalPackage");
const RemotePackage = require("./RemotePackage");
const localPackage = require("./LocalPackage");
const sessionStore = new Store({name: 'constants'})
// const remotePackage = require('./remotePackage');
// const localPackage = require('./localPackage');

const gt = require('semver').gt

ipcRenderer.on('versionUpdateError', (event, message) => {
    ipcRenderer.invoke('bsevent', {event: 'errormessage', data: { title: "Package Update Error", message: message }})
})

class PackageManager {
    static getModulesMeta() {
        return JSON.parse(fs.readFileSync(store.get("modulespath"), 'utf8'))
        // return JSON.parse(fs.readFileSync(path.join(
        //     sessionStore.get("appRoot").replace("app.asar", ""),
        //     "modules.json"
        // ), 'utf8'))
    }
    constructor() {
        // sessionStore.delete('modules') // question: why delete if we set then?
        ipcRenderer.invoke('listInstalled')
        this.modules = PackageManager.getModulesMeta()
        sessionStore.set('modules', this.modules)
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
                // question: why delete if we set then?
                sessionStore.delete("restartNeeded")
                sessionStore.set("restartNeeded", true)

                // question: why we exit here?
                return
            }
        }

        const _remotePackage = new RemotePackage(module)
        await _remotePackage.getRemoteDetails(versionToUpdate)
        switch (module.update) {
            case 'auto':
                if (gt(_remotePackage.version, _localPackage.version)) {
                    restartNeeded = restartNeeded || await _remotePackage.installPackage()
                }
                break
            case 'manual':
                if (versionToUpdate !== undefined) {
                    restartNeeded = restartNeeded || await _remotePackage.installPackage()
                }
                ipcRenderer.invoke('core-module-update-available', module)
                break
            default:
                console.warn('Update mode unknown: ', module.update)
        }

        if (!sessionStore.get("restartNeeded") && restartNeeded) {
            sessionStore.delete("restartNeeded")
            sessionStore.set("restartNeeded", true)
        }

        return restartNeeded
    }

    async updatePackages() {
        ipcRenderer.invoke('status-message', {"message": "Checking for updates..."})
        sessionStore.delete("restartNeeded")
        sessionStore.set("restartNeeded", false)

        for (const module of this.modules.core) {
            await this.updateOnePackage(module)
        }
        for (const dialog of this.modules.dialogs) {
            await this.updateOnePackage(dialog)
        }
        ipcRenderer.invoke('status-message', {"message": "Update check is done ..."})

        return sessionStore.get("restartNeeded")
    }

    static async getPackagesVersions() {
        let modules = PackageUpdater.getModulesMeta()

        const process_package = async (package_item, additional_data = {}) => {
            ipcRenderer.invoke('status-message', {
                message: `Checking version of ${package_item.name} ...`,
                nomain: true
            })
            const _remotePackage = new RemotePackage(package_item)
            await _remotePackage.getRemoteDetails()
            const {name, version, description} = new LocalPackage(package_item)
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


module.exports = PackageManager