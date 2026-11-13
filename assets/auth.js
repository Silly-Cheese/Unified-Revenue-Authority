import {auth,db,functions} from "./firebase.js";
import {createUserWithEmailAndPassword,signInWithEmailAndPassword,signOut,updateProfile,onAuthStateChanged,EmailAuthProvider,reauthenticateWithCredential,updatePassword} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import {doc,getDoc} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";
import {httpsCallable} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-functions.js";

export function cleanName(raw){return String(raw||"").normalize("NFKC").trim().replace(/\s+/g," ");}
export function validateName(raw){return /^[A-Za-z][A-Za-z '-]{2,59}$/.test(cleanName(raw));}
export async function internalAddress(name){
 const normalized=cleanName(name).toLocaleLowerCase("en-US");
 const bytes=new TextEncoder().encode(normalized);
 const hash=await crypto.subtle.digest("SHA-256",bytes);
 const hex=[...new Uint8Array(hash)].map(n=>n.toString(16).padStart(2,"0")).join("");
 return hex+"@accounts.ura.invalid";
}
export function authListener(fn){return onAuthStateChanged(auth,fn);}
export async function profile(uid){const snap=await getDoc(doc(db,"users",uid));return snap.exists()?{id:snap.id,...snap.data()}:null;}
export async function register(name,password){
 name=cleanName(name);
 if(!validateName(name))throw Error("Use a full fictional name (3–60 letters, spaces, apostrophes or hyphens).");
 if(name.toLowerCase()==="christopher shelley")throw Error("This name is reserved for the founding Commissioner.");
 if(password.length<10||password.length>128)throw Error("Your password must contain 10–128 characters.");
 const user=await createUserWithEmailAndPassword(auth,await internalAddress(name),password);
 try{
   await updateProfile(user.user,{displayName:name});
   await httpsCallable(functions,"registerProfile")({name});
 }catch(e){await signOut(auth);throw Error(e.message||"Could not complete registration; contact an administrator.");}
 return user.user;
}
export async function login(name,password){
 if(!validateName(name))throw Error("Enter the full name used at registration.");
 return (await signInWithEmailAndPassword(auth,await internalAddress(name),password)).user;
}
export async function changePassword(currentPassword,newPassword){
 const user=auth.currentUser;
 if(!user?.email)throw Error("Sign in again to change your password.");
 const credential=EmailAuthProvider.credential(user.email,currentPassword);
 await reauthenticateWithCredential(user,credential);
 await updatePassword(user,newPassword);
}
export async function logout(){return signOut(auth);}
export const call=(name,data={})=>httpsCallable(functions,name)(data);
