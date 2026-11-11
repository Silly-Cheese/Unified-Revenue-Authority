// Run locally with trusted Google Application Default Credentials.
// Never deploy this as a public endpoint; never commit credentials or a password.
import {initializeApp,applicationDefault} from "firebase-admin/app";
import {getAuth} from "firebase-admin/auth";
import {getFirestore,FieldValue} from "firebase-admin/firestore";
import {addressForName,COMMISSIONER_NAME} from "../lib/identity.js";
const projectId="unified-revenue-authority";
const password=process.env.URA_COMMISSIONER_PASSWORD||"";
if(password.length<10||password.length>128){
 console.error("Set URA_COMMISSIONER_PASSWORD to a unique 10–128-character password before bootstrapping.");
 process.exit(1);
}
initializeApp({credential:applicationDefault(),projectId});
const auth=getAuth(),db=getFirestore(),setupRef=db.collection("system").doc("bootstrap");
const email=addressForName(COMMISSIONER_NAME);
try{
 const already=await setupRef.get();
 if(already.exists)throw new Error("The agency has already been bootstrapped. No changes made.");
 try{
  await auth.getUserByEmail(email);
  throw new Error("A Firebase Auth user already holds the Commissioner name. No promotion performed. Investigate this account.");
 }catch(e){if(e.code!=="auth/user-not-found")throw e;}
 const created=await auth.createUser({email,password,displayName:COMMISSIONER_NAME,disabled:false});
 try{
  await db.runTransaction(async tx=>{
   const guard=await tx.get(setupRef);
   if(guard.exists)throw new Error("Bootstrap already completed concurrently.");
   tx.create(db.collection("users").doc(created.uid),{
    displayName:COMMISSIONER_NAME,role:"commissioner",status:"active",taxpayerId:null,
    createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()
   });
   tx.create(setupRef,{
    commissionerUid:created.uid,commissionerName:COMMISSIONER_NAME,
    completedAt:FieldValue.serverTimestamp(),schemaVersion:1
   });
   tx.create(db.collection("auditLogs").doc(),{
    action:"Agency initialized",detail:"Founding Commissioner identity created.",
    actorUid:created.uid,actorName:COMMISSIONER_NAME,targetId:created.uid,
    createdAt:FieldValue.serverTimestamp()
   });
  });
 }catch(error){
  console.error("Firestore setup failed. Firebase Auth account may have been created; investigate manually before retrying.");
  throw error;
 }
 console.log("Bootstrap complete. Commissioner:",COMMISSIONER_NAME);
 console.log("Firebase Auth UID:",created.uid);
 console.log("Log in with the name and password you supplied. Keep that password private.");
}catch(error){console.error("Bootstrap stopped:",error.message);process.exitCode=1;}