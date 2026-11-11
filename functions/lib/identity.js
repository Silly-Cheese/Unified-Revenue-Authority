import {createHash} from "node:crypto";
export function cleanName(raw){return String(raw||"").normalize("NFKC").trim().replace(/\s+/g," ");}
export function validName(raw){return /^[A-Za-z][A-Za-z '-]{2,59}$/.test(cleanName(raw));}
export function addressForName(raw){
 const name=cleanName(raw);
 if(!validName(name))throw new Error("Invalid fictional name.");
 const digest=createHash("sha256").update(name.toLocaleLowerCase("en-US"),"utf8").digest("hex");
 return digest+"@accounts.ura.invalid";
}
export const COMMISSIONER_NAME="Christopher Shelley";