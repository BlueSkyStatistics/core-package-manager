const {join, normalize} = require('path')

try {
    var LocalPackage = require("./localPackage")
} catch (ex) {
    var LocalPackage = require(path.normalize(__dirname + "/LocalPackage"));
}

class DialogsPackage extends LocalPackage {
    constructor(packageJson) {
        super(packageJson)
        this.nav = this._getNav()
    }

    _getNav() {
        let importPath = this.realImportPath
        let packageNav
        try {
            //ipcRenderer.invoke("log", { message: `Importing from ${importPath}` , source: "DialogsPackage", event: "spawn" })
            packageNav = require(importPath).nav
        } catch(ex) {
            console.warn(`Could not import ${importPath}`)
            return []
        }
        const pathAddon = importPath.replace("nav.js", "")

        let packageNavList = []
        if (packageNav.buttons !== undefined) {
            packageNavList.push(packageNav)
        } else {
            packageNavList = packageNav
        }
        // var navList = []
        const navList = packageNavList.map(p => {
            p.buttons = p.buttons.map(b => {
                if (typeof b === 'object') {
                    if (b.children === undefined) {
                        ipcRenderer.invoke("log", { message: `We should not be here, unless we trying to store some object in the nav` , source: "DialogsPackage", event: "spawn" })
                    } else {
                        b.children = b.children.map(c => normalize(join(pathAddon, c)))
                    }
                    return b
                } else {
                    return normalize(join(pathAddon, b))
                }
            }).filter(b => b !== null)
            delete require.cache[importPath]
            return p
        })
        return navList
    }
}

module.exports = DialogsPackage