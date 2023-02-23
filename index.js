// module.exports = {
//     BSEvent,
//     css: ['notifyer.css']
// }

const PackageManager = require("./js/PackageManager")
const LocalPackage = require("./js/LocalPackage")
const RemotePackage = require("./js/RemotePackage")
const DialogsPackage = require("./js/DialogsPackage")
const {handleMarketUpdateClick} = require("./js/handlers")

module.exports = {
    PackageManager,
    LocalPackage,
    RemotePackage,
    DialogsPackage,
    handleMarketUpdateClick
}