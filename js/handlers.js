const packageUpdateSuccessMessage = {
    title: 'Update Successful',
    icon: 'fa fa-exclamation-triangle',
    message: `
    <div>
        Update of module complete restart required to apply changes 
    </div>
    <div class="w-100">
        <button class="btn btn-secondary float-right" onclick='restartApp()'>
            Restart
        </button>
    </div>
    `
}

const packageUpdateVersionInstalledMessage = {
    icon: 'fa fa-check',
    message: 'You have this version installed'
}

const updateModule = async (manager, module, version) => {
    const restartNeeded = await manager.updateOnePackage(module, version)
    restartNeeded && new BSEvent('notify').emit(packageUpdateSuccessMessage)
}

const findModule = (moduleType, moduleName) =>
    sessionStore.get("modules", {})[moduleType]?.find(
        m => m.name === moduleName
    )


const handleMarketUpdateClick = async (manager, el) => {
    const {moduleType, module: moduleName, version: currentVersion} = el.dataset
    const selectedVersion = $(el).siblings('select.versionsSelect').val()
    if (selectedVersion === currentVersion) {
        new BSEvent('notify').emit(packageUpdateVersionInstalledMessage)
    } else {
        const module = findModule(moduleType, moduleName)
        await updateModule(manager, module, selectedVersion)
    }
}

module.exports = {
    handleMarketUpdateClick
}


