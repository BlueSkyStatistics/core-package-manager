/**
  * This file is protected by copyright (c) 2023-2025 by BlueSky Statistics, LLC.
  * All rights reserved. The copy, modification, or distribution of this file is not
  * allowed without the prior written permission from BlueSky Statistics, LLC.
 */

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


module.exports = {
    packageUpdateVersionInstalledMessage,
    updateModule
}


