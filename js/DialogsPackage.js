const LocalPackage = require("./localPackage")


class DialogsPackage extends LocalPackage {
    constructor(packageJson) {
        super(packageJson)
        this.nav = this._getNav()
    }

    _getNav() {
        // question: why to try \ except when we have realImportPath
        let importPath = this.realImportPath
        let packageNav
        try {
            packageNav = require(importPath).nav
            console.log(`Importing from ${importPath}`)
        } catch(ex) {
            importPath = this.devImportPath
            packageNav = require(importPath).nav
            console.warn(`Importing from ${importPath}`)
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
            console.log('making nav', p)
            p.buttons = p.buttons.map(b => {
                if (typeof b === 'object') {
                    if (b.children === undefined) {
                        console.log("We should not be here, unless we trying to store some object in the nav")
                    } else {
                        b.children = b.children.map(c => path.join(pathAddon, c))
                    }
                    return b
                } else {
                    return path.join(pathAddon, b)
                }
            }).filter(b => b !== null)
            delete require.cache[importPath]
            return p

            // for(const level = 0; level < p.buttons.length; level++) {
            //     if (typeof(p.buttons[level]) == "object" && p.buttons[level].children == undefined) {
            //         console.log("We should not be here, unless we trying to store some object in the nav")
            //     } else if (typeof(p.buttons[level]) == "object" && p.buttons[level].children != undefined) {
            //         for (var sublevel = 0; sublevel < p.buttons[level].children.length; sublevel++) {
            //             p.buttons[level].children[sublevel] = path.join(pathAddon, p.buttons[level].children[sublevel])
            //         }
            //     } else {
            //         p.buttons[level] = path.join(pathAddon, p.buttons[level])
            //     }
            // }
            // delete require.cache[importPath]
            // navList.push(packagenav)
        })
        return navList
    }
}

module.exports = DialogsPackage