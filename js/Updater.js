const {packageUpdateSuccessMessage, MODULES_STORE_KEY, INSTALLED_PACKAGES_STORE_KEY, RESTART_NEEDED_STORE_KEY} = require("./constants")


class Updater {
    constructor({manager}) {
        this.manager = manager
        // this.manager.ipcRenderer.invoke('listInstalled')
        // this.manager.ipcRenderer.sendSync('bsevent', {event: 'listInstalled'})
        // this.manager.ipcRenderer.send('bsevent', {event: 'listInstalled'})
        if ( this.manager.store.get(INSTALLED_PACKAGES_STORE_KEY) === undefined ) {
            this.manager.ipcRenderer.sendSync("bsevent", {'event': 'listInstalled'})
        }
        this.modules = this.manager.store.get(MODULES_STORE_KEY)
    }

    importInit() {
        this.modules.init?.forEach(i =>
            this.manager.getLocalPackage(i).importAllFromPackage()
        )
    }

    importPackages() {
        // To avoid async and be prepared for app launch we import whatever we have
        this.modules.core.forEach(i =>
            this.manager.getLocalPackage(i).importAllFromPackage()
        )
    }

    addExtensions() {
        this.modules.extentions.forEach(i =>
            this.manager.getLocalPackage(i).requirePackage()
        )
    }

    async updateOnePackage(module, versionToUpdate = undefined) {
        let restartNeeded = false

        let _localPackage = this.manager.getLocalPackage(module)
        if (_localPackage.version === '0.0.0' ) {
            // We have no local package, so we copy it
            if (_localPackage.copyFromInstaller()) {
                restartNeeded = true
                _localPackage = this.manager.getLocalPackage(module)
            }
        }
        if (_localPackage.sourceType === 'local') {
            if ( this.manager.semver.gt(_localPackage.getInstallerVersion(), _localPackage.version)) {
                restartNeeded = _localPackage.copyFromInstaller()
            }
            if (!this.manager.store.get(RESTART_NEEDED_STORE_KEY) && restartNeeded) {
                this.manager.store.delete(RESTART_NEEDED_STORE_KEY)
                this.manager.store.set(RESTART_NEEDED_STORE_KEY, true)
                return
            }
        }

        if (!this.manager.isOnline) {
            return
        }

        const _remotePackage = this.manager.getRemotePackage(module)
        await _remotePackage.getRemoteDetails(versionToUpdate)
        switch (module.update) {
            case 'auto':
                if (this.manager.semver.gt(_remotePackage.version, _localPackage.version)) {
                    restartNeeded = restartNeeded || await _remotePackage.installPackage()
                }
                break
            case 'manual':
                if (versionToUpdate !== undefined) {
                    restartNeeded = restartNeeded || await _remotePackage.installPackage()
                }
                this.manager.ipcRenderer.invoke('core-module-update-available', module)
                break
            default:
                console.warn('Update mode unknown: ', module.update)
        }

        if (!this.manager.store.get(RESTART_NEEDED_STORE_KEY) && restartNeeded) {
            this.manager.store.delete(RESTART_NEEDED_STORE_KEY)
            this.manager.store.set(RESTART_NEEDED_STORE_KEY, true)
        }

        return restartNeeded
    }

    async updatePackages() {
        this.manager.ipcRenderer.invoke('status-message', {"message": "Checking for updates..."})
        this.manager.store.delete(RESTART_NEEDED_STORE_KEY)
        this.manager.store.set(RESTART_NEEDED_STORE_KEY, false)

        for (const module of this.modules.core) {
            await this.updateOnePackage(module)
        }
        for (const dialog of this.modules.dialogs) {
            await this.updateOnePackage(dialog)
        }
        this.manager.ipcRenderer.invoke('status-message', {"message": "Update check is done ..."})

        return this.manager.store.get(RESTART_NEEDED_STORE_KEY)
    }

    async getPackagesVersions() {
        const process_package = async (package_item, additional_data = {}) => {
            const {name, version, description} = this.manager.getLocalPackage(package_item)

            let _remotePackage
            if (!this.manager.isOnline) {
                _remotePackage = {versions: [{name: version}]}
            } else {
                this.manager.ipcRenderer.invoke('status-message', {
                    message: `Checking version of ${package_item.name} ...`,
                    nomain: true
                })
                _remotePackage = this.manager.getRemotePackage(package_item)
                await _remotePackage.getRemoteDetails()
            }

            return {
                name, version, description,
                available: _remotePackage.versions,
                ...additional_data
            }
        }

        const coreModulesVersions = await Promise.all(
            this.modules.core.map(async i => await process_package(i, {type: "core"}))
        )
        const dialogModulesVersions = await Promise.all(
            this.modules.dialogs.map(async i => await process_package(i, {type: "dialogs"}))
        )
        return [...coreModulesVersions, ...dialogModulesVersions]
    }

    findModule = (moduleType, moduleName) =>
        this.modules[moduleType]?.find(
            m => m.name === moduleName
        )

    updateModule = async (module, version) => {
        const restartNeeded = await this.updateOnePackage(module, version)
        restartNeeded && this.manager.notify(packageUpdateSuccessMessage)
    }
}


module.exports = Updater