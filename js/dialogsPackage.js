const LocalPackage = require("./localPackage")


class DialogsPackage extends LocalPackage {
    constructor(packageJson) {
        super(packageJson)
        this.nav = this._getNav()
    }

    _getNav() {
        var importPath = this.importPath;
        if (sessionStore.get("appMode") != 'prod') {
            importPath = this.devImportPath;
        }
        // console.log(sessionStore.get("appMode"))
        try {
            var packagenav = require(importPath).nav
            console.log(`Importing from ${importPath}`)
        } catch(ex) {
            importPath = this.devImportPath;
            var packagenav = require(importPath).nav
            console.log(`Importing from ${importPath}`)
        }
        var pathAddon = importPath.replace("nav.js", "")
        var packagenavList = []
        if (packagenav.buttons != undefined) {
            packagenavList.push(packagenav)
        } else {
            packagenavList = packagenav
        }
        var navList = []
        packagenavList.forEach(function(packagenav) {
            for(const level = 0; level < packagenav.buttons.length; level++) {
                if (typeof(packagenav.buttons[level]) == "object" && packagenav.buttons[level].children == undefined) {
                    console.log("We should not be here, unless we trying to store some object in the nav")
                } else if (typeof(packagenav.buttons[level]) == "object" && packagenav.buttons[level].children != undefined) {
                    for (var sublevel = 0; sublevel < packagenav.buttons[level].children.length; sublevel++) {
                        packagenav.buttons[level].children[sublevel] = path.join(pathAddon, packagenav.buttons[level].children[sublevel])
                    }
                } else {
                    packagenav.buttons[level] = path.join(pathAddon, packagenav.buttons[level])
                }
            }
            delete require.cache[importPath]
            navList.push(packagenav)
        })
        return navList
    }
}

module.exports = DialogsPackage