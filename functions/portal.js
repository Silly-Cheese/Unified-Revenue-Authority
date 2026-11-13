// Commissioner-only conversion of an existing NPC/agency-created taxpayer into
// a name-and-password portal user, without erasing or rewriting any historic RP records.
import {onCall,HttpsError} from "firebase-functions/v2/https";
import {getAuth} from "firebase-admin/auth";
import {getFirestore,FieldValue} from "firebase-admin/firestore";
import {addressForName} from "./lib/identity.js";
import {canActivateTaxpayer,validatePortalName,validatePortalPassword} from "./lib/portal-access.js";

const opts={cors:true,invoker:"public"};
const db=()=>getFirestore();
function fail(code,message){throw new HttpsError(code,message);}

export const activateTaxpayerPortal=onCall(opts,async req=>{
 if(!req.auth?.uid)fail("unauthenticated","Sign in as Commissioner.");
 const commissionerUid=req.auth.uid;
 const profile=await db().collection("users").doc(commissionerUid).get();
 if(!profile.exists||profile.data().role!=="commissioner"||profile.data().status!=="active")
  fail("permission-denied","Only the active Commissioner can activate taxpayer portals.");

 const taxpayerId=String(req.data?.taxpayerId||"");
 if(!/^[A-Za-z0-9]{20}$/.test(taxpayerId))
  fail("invalid-argument","Select a valid taxpayer record.");

 let portalName,password;
 try{
  portalName=validatePortalName(req.data?.portalName);
  password=validatePortalPassword(req.data?.password);
 }catch(err){fail("invalid-argument",err.message);}
 const taxpayerRef=db().collection("taxpayers").doc(taxpayerId);
 const taxpayerSnap=await taxpayerRef.get();
 if(!taxpayerSnap.exists)fail("not-found","Taxpayer record was not found.");
 if(!canActivateTaxpayer(taxpayerSnap.data()))
  fail("failed-precondition","This taxpayer is archived or already linked to a portal account.");

 // Firebase Auth enforces uniqueness of the deterministic RP name login.
 // Do not create accounts in the browser as that would switch the Commissioner's session.
 const auth=getAuth();
 let created;
 try{
  created=await auth.createUser({
   email:addressForName(portalName),displayName:portalName,
   password,disabled:false,emailVerified:false
  });
 }catch(err){
  if(["auth/email-already-exists","auth/uid-already-exists"].includes(err.code))
   fail("already-exists","That fictional login name is already registered. Choose another portal name.");
  if(err instanceof HttpsError)throw err;
  fail("internal","Could not create the portal login. Check Firebase Authentication configuration.");
 }

 try{
  await db().runTransaction(async tx=>{
   const userRef=db().collection("users").doc(created.uid);
   const [latest,existing]=await Promise.all([tx.get(taxpayerRef),tx.get(userRef)]);
   if(!latest.exists||!canActivateTaxpayer(latest.data()))
    fail("failed-precondition","This taxpayer has already been linked, archived, or changed during activation.");
   if(existing.exists)fail("failed-precondition","The new authentication account has an unexpected existing profile.");
   tx.create(userRef,{
    displayName:portalName,role:"citizen",status:"active",taxpayerId,
    portalOrigin:latest.data().simulated===true?"converted_npc":"converted_agency",
    createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()
   });
   tx.update(taxpayerRef,{
    ownerUid:created.uid,portalName,portalActivatedAt:FieldValue.serverTimestamp(),
    portalActivatedBy:commissionerUid,updatedAt:FieldValue.serverTimestamp()
   });
   tx.create(db().collection("auditLogs").doc(),{
    action:"Taxpayer portal activated",
    detail:"Existing fictional taxpayer converted to citizen portal; history preserved.",
    actorUid:commissionerUid,actorName:profile.data().displayName,
    targetId:taxpayerId,createdAt:FieldValue.serverTimestamp()
   });
  });
 }catch(err){
  // A transaction may succeed even if its response is lost; never delete a
  // successful portal account in an ambiguous network-failure situation.
  let owned=false;
  try{
   const verification=await taxpayerRef.get();
   owned=verification.exists&&verification.data().ownerUid===created.uid;
  }catch{
   fail("unavailable","Activation status is uncertain. Check the taxpayer portal status before retrying.");
  }
  if(owned)return {ok:true,taxpayerId,portalName};
  try{await auth.deleteUser(created.uid);}
  catch{
   fail("internal","Activation failed; an orphaned authentication user may need an administrator's attention before reusing this login name.");
  }
  if(err instanceof HttpsError)throw err;
  fail("internal","Could not link the new portal to the taxpayer. No taxpayer history was changed.");
 }

 return {ok:true,taxpayerId,portalName};
});
