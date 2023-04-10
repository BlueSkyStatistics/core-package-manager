const LocalPackage = require('./LocalPackage')
const {join, normalize} = require('path')


class DialogsPackage extends LocalPackage {
    constructor(packageJson) {
        super(packageJson)
        this.nav = this._getNav()
    }

    _getNav() {
        let importPath = this.realImportPath
        let packageNav
        try {
            console.log(`Importing from ${importPath}`)
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
        return packageNavList.map(p => {
            console.log('making nav', p)
            p.buttons = p.buttons.map(b => {
                if (typeof b === 'object') {
                    if (b.children === undefined) {
                        console.log("We should not be here, unless we trying to store some object in the nav")
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
    }
}

module.exports = DialogsPackage