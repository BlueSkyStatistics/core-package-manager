import {
    collection, query, where, getDocs,
    and, or, doc, addDoc, getDoc, getFirestore
} from "firebase/firestore";
import {onRequest} from "firebase-functions/v2/https";
import {initializeApp} from "firebase/app";
import {getAuth, signInWithCustomToken} from "firebase/auth";
import serviceAccount from './bsky_service_acc.json' assert {type: 'json'};

const app = initializeApp(serviceAccount)
const auth = getAuth(app)
const db = getFirestore(app)

const modulesCollectionName = "modules";
const modulesCacheCollectionName = "modules_cache";
const userSubscriptionsCollectionName = "subscriptions";
const minBSkyVersion = "minBSkyVersion";
const minAppVersion = "minAppVersion";
const publicRoleName = "public";
const moduleSubscriptionsKey = "subscriptions";


const getActiveSubscriptions = async user => {
    let activeSubscriptions = [publicRoleName]
    if (user && user.email) {
        const userSubscriptionsRef = doc(db,
            userSubscriptionsCollectionName, user.email);
        const userSubscriptionsSnap = await getDoc(userSubscriptionsRef);
        if (userSubscriptionsSnap.exists()) {
            activeSubscriptions = Object.values(userSubscriptionsSnap.data().activeSubscriptions).map(i => i.planName);
            if (!activeSubscriptions.includes(publicRoleName)) {
                activeSubscriptions.push(publicRoleName);
            }
        } else {
            console.log("No activeSubscriptions for user:", user.email);
        }
    }
    return activeSubscriptions
}

export const queryModules = onRequest(async (request, response) => {
    let {user, subscriptions} = request.body
    const clientAppVersion = request.body.clientAppVersion || null
    const bSkyVersion = request.body.bSkyVersion || null

    // const clientAppVersion = request.query.clientAppVersion || null;
    // const bSkyVersion = request.query.bSkyVersion || null;
    // const user = request.user;
    // if (user === undefined) {
    //     console.warn("User undefined");
    // }

    try {
        if (user && user?.customToken) {
            try {
                await signInWithCustomToken(auth, user.customToken)
            } catch (ex) {
                // this is needed to handle expired session case
                // otherwise we are getting error 500 there
                user.email = undefined
                subscriptions = ['public']
            }   
        }
        let activeSubscriptions
        if (user && user?.email) {
            activeSubscriptions = await getActiveSubscriptions(user)
        } else if (subscriptions) {
            activeSubscriptions = subscriptions
        } else {
            response.status(400).send("Body: user or subscriptions expected")
        }
        activeSubscriptions = activeSubscriptions.sort()
        const activeSubscriptionsStr = activeSubscriptions.join(":")
        const clientAppVersionFilter = [
            where(minAppVersion, "==", null)
        ]
        clientAppVersion && clientAppVersionFilter.push(
            where(minAppVersion, ">=", clientAppVersion)
        )
        // const bSkyVersionFilter = [
        //     where(minBSkyVersion, "==", null)
        // ]
        // bSkyVersion && bSkyVersionFilter.push(
        //     where(minBSkyVersion, ">=", bSkyVersion)
        // )

        const q = query(collection(db, modulesCollectionName), and(
            where(moduleSubscriptionsKey,
                "array-contains-any", activeSubscriptions),
            or(...clientAppVersionFilter),
            // or(...bSkyVersionFilter),
        ));
        const snapshot = await getDocs(q);
        const modules = {};
        snapshot.forEach((i) => {
            const data = i.data()
            const {name, version} = data
            const trimmedName = name.split('/').at(-1)
            if (!modules[trimmedName]) {
                modules[trimmedName] = {}
            }
            // TODO: add check for bskyversion and if fits add to versions
            modules[trimmedName][version] = data
        });

        try {
            const docsq = query(collection(db, modulesCacheCollectionName), 
                    where (moduleSubscriptionsKey, '==', activeSubscriptionsStr))
            const docsData = await getDocs(docsq);
            if (docsData.empty) {
                await addDoc(collection(db, modulesCacheCollectionName), {
                    [minAppVersion]: clientAppVersion,
                    [minBSkyVersion]: bSkyVersion,
                    subscriptions: activeSubscriptionsStr,
                    modules: modules,
                    created_at: new Date()
                });
            }
            
        } catch (e) {
            console.error("Error writing document: ", e);
        }

        response.json(modules);
    } catch (error) {
        console.error("Error querying modules:", error);
        response.status(500).send("Internal Server Error");
    }
});
