/**
  * This file is protected by copyright (c) 2023-2025 by BlueSky Statistics, LLC.
  * All rights reserved. The copy, modification, or distribution of this file is not
  * allowed without the prior written permission from BlueSky Statistics, LLC.
 */

const {join, normalize, dirname} = require('path')
const LocalPackage = require("./LocalPackage");

// try {
//     var LocalPackage = require("./localPackage")
// } catch (ex) {
//     var LocalPackage = require(path.normalize(__dirname + "/LocalPackage"));
// }

class DialogsPackage extends LocalPackage {
    constructor(packageJson) {
        super(packageJson)
        this.nav = this._getNav()
    }

    _getNav() {
        const importPath = this.importPath
        let packageNav
        try {
            ipcRenderer.invoke("log", { message: `Importing from ${importPath}` , source: "_DP", event: "spawn" })
            packageNav = global.getDialog(importPath, 'nav')//require(importPath).nav
        } catch(ex) {
            console.warn(`Could not import ${importPath}\n`, ex)
            return []
        }
        const pathAddon = dirname(importPath)

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
                        b.children = b.children.map(c => {
                            if (typeof c !== 'string') return c;
                            if (path.isAbsolute(c) || c.startsWith(pathAddon)) {
                                return normalize(c);
                            } else {
                                return normalize(join(pathAddon, c));
                            }
                        })
                    }
                    return b
                } else {
                    if (typeof b !== 'string') return b;
                    if (path.isAbsolute(b) || b.startsWith(pathAddon)) {
                        return normalize(b);
                    } else {
                        return normalize(join(pathAddon, b));
                    }
                }
            }).filter(b => b !== null)
            delete require.cache[importPath]
            return p
        })
        return navList
    }
}

module.exports = DialogsPackage