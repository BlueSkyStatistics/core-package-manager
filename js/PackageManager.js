const ipcRenderer = require('electron').ipcRenderer
const LocalPackage = require("./LocalPackage")
const RemotePackage = require("./RemotePackage")
const {packageUpdateVersionInstalledMessage, updateModule} = require("./handlers");
const gt = require('semver').gt

// ipcRenderer.on('versionUpdateError', (event, message) => {
//     ipcRenderer.invoke('bsevent', {event: 'errormessage', data: { title: "Package Update Error", message: message }})
// })

const {sessionStore} = global

class PackageManager {
    constructor() {
        ipcRenderer.invoke('listInstalled')
        this.modules = sessionStore.get('modules')
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
        let modules = PackageManager.getModulesMeta()

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