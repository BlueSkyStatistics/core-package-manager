/**
  * This file is protected by copyright (c) 2023-2025 by BlueSky Statistics, LLC.
  * All rights reserved. The copy, modification, or distribution of this file is not
  * allowed without the prior written permission from BlueSky Statistics, LLC.
 */

const {join, normalize, dirname} = require('path')

try {
    var LocalPackage = require("./LocalPackage")
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

        //following 3 lines (with ipc 'status-message' below) just to show status message on the splash
        const parts = importPath.split(/[/\\]/); // split on both \ and /
        const asarIndex = parts.findIndex(p => p.endsWith(".asar"));
        let asarname = asarIndex !== -1 ? parts[asarIndex] : "loading...";

        try {
            ipcRenderer.invoke('status-message', {"message": `Importing ${asarname} ...`})
            ipcRenderer.invoke("log", { message: `Importing from ${importPath}` , source: "_DP", event: "spawn" })
            packageNav = global.getDialog(importPath, 'nav')//require(importPath).nav
        } catch(ex) {
            console.warn(`Could not import ${importPath}`)
            return []
        }
        const pathAddon = normalize(importPath.replace("nav.js", ""))
        const modalsPath = normalize(dirname(pathAddon));
        ipcRenderer.invoke("log", { message: `getnav addonpath: ${pathAddon}` , source: "_DP", event: "spawn" })
        let packageNavList = []
        if (packageNav.buttons !== undefined) {
            packageNavList.push(packageNav)
        } else {
            packageNavList = packageNav
        }
        // store.set("ResumeStatus", packageNavList)
        // var navList = []
        const navList = packageNavList.map(p => {
            p.buttons = p.buttons.map(b => {
                if (typeof b === 'object') {
                    if (b.children === undefined) {
                        ipcRenderer.invoke("log", { message: `We should not be here, unless we trying to store some object in the nav` , source: "DialogsPackage", event: "spawn" })
                    } else {
                        // b.children = b.children.map(c => normalize(join(pathAddon, c)))// this line duplication issue. Replaced with following
                        
                        b.children = b.children.map(c => {
                            //ipcRenderer.invoke("log", { message: `Processing nav menu dialog ${c}` , source: "DialogsPackage", event: "spawn" })
                            if (normalize(c).startsWith(modalsPath)) {
                                return normalize(c)
                            } else {
                                return normalize(join(pathAddon, c))
                            }  
                        })
                    }
                    return b
                } else {
                    // return normalize(join(pathAddon, b))// this line duplication issue. Replaced with following
                    //ipcRenderer.invoke("log", { message: `Processing nav leaf dialog ${b}` , source: "DialogsPackage", event: "spawn" })
                    if (normalize(b).startsWith(modalsPath)) {
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