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

function updateModule(manager, event) {
    const versionToUpdate = $(event.target).siblings()[0].value
    sessionStore.get("modules", [])[event.target.dataset.moduleType].forEach(module => {
        if (module.name === event.target.dataset.module) {
            manager.updateOnePackage(module, versionToUpdate).then(restartNeeded => {
                restartNeeded && new BSEvent('notify').emit(packageUpdateSuccessMessage)
            })
        }
    })
}

module.exports = updateModule


