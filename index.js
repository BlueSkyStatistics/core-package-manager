const Updater = require("./js/Updater")
const LocalPackage = require("./js/LocalPackage")
const RemotePackage = require("./js/RemotePackage")
const DialogsPackage = require("./js/DialogsPackage")
const {packageUpdateVersionInstalledMessage} = require("./js/constants")

class PackageManager {
    constructor({store, ipcRenderer, semver, squirrelly, global, isOnline}) {
        this.store = store
        this.ipcRenderer = ipcRenderer
        this.semver = semver
        this.squirrelly = squirrelly
        this.isOnline = isOnline
        this.global = global
    }

    getUpdater = () => new Updater({manager: this})
    getLocalPackage = props => new LocalPackage({...props, manager: this})
    getRemotePackage = props => new RemotePackage({...props, manager: this})
    getDialogsPackage = props => new DialogsPackage({...props, manager: this})


    notify = messageObj => {
        const EM = this.global.BSEvent
        if (EM) {
            try {
                return new EM('notify').emit(messageObj)
            } catch (e) {
                console.warn(e)
            }
        }
        console.log('No event manager available')
    }
    handleMarketUpdateClick = async (moduleName, moduleType, currentVersion, selectedVersion) => {
        if (selectedVersion === currentVersion) {
            this.notify(packageUpdateVersionInstalledMessage)
        } else {
            const updater = this.getUpdater()
            const module = updater.findModule(moduleType, moduleName)
            await updater.updateModule(module, selectedVersion)
        }
    }
}

module.exports = {
    PackageManager,
}