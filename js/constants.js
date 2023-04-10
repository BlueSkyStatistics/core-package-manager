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

const MODULES_STORE_KEY = 'modulesContent'
const INSTALLED_PACKAGES_STORE_KEY = 'installedPackages'
const RESTART_NEEDED_STORE_KEY = 'restartNeeded'


module.exports = {
    packageUpdateSuccessMessage,
    packageUpdateVersionInstalledMessage,
    MODULES_STORE_KEY,
    INSTALLED_PACKAGES_STORE_KEY,
    RESTART_NEEDED_STORE_KEY
}


