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
        let packageNav
        try {
            ipcRenderer.invoke("log", { message: `Importing from ${this.importPath}` , source: "DialogsPackage", event: "spawn" })
            packageNav = global.getDialog(importPath, 'nav')
        } catch(ex) {
            console.warn(`Could not import ${this.importPath}`)
            return []
        }
        // const pathAddon = this.importPath.replace("nav.js", "")

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
                        // b.children = b.children.map(c => normalize(join(pathAddon, c)))
                        b.children = b.children.map(c => normalize(join(this.path, c)))
                    }
                    return b
                } else {
                    // return normalize(join(pathAddon, b))
                    return normalize(join(this.path, b))
                }
            }).filter(b => b !== null)
            delete require.cache[this.importPath]
            return p
        })
        return navList
    }
}

module.exports = DialogsPackage
