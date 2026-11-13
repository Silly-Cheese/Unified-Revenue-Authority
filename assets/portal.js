// Commissioner-only frontend for turning an existing fictional taxpayer record
// into a portal login. The password is sent only to Firebase callable backend.
import {call} from "./auth.js";

const escape=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;":"&quot;","'":"&#39;"}[c]));
const validateName=name=>/^[A-Za-z][A-Za-z '-]{2,59}$/.test(name);
export function openPortalActivation(t,h){
 const linked=Boolean(t.ownerUid||t.ownerLinked);
 if(linked||t.status!=="active"){
  h.toast(linked?"This taxpayer already has a portal account.":"Only active taxpayer records can be converted.",true);
  return;
 }
 const name=t.portalName||t.fullName||"";
 const suggestion=validateName(name)&&name.toLowerCase()!=="christopher shelley"?name:"";
 const body='<div class="modal-body">'+
 '<div class="p-intro"><strong>Activate citizen portal access</strong><p>The existing taxpayer record and every linked fictional return, Treasury balance, refund, and administrative case will stay intact. This only creates a secure name-and-password login.</p></div>'+
 '<div class="p-summary"><div><small>Taxpayer</small><strong>'+escape(t.fullName)+'</strong></div><div><small>Reference</small><strong>'+escape(t.taxpayerNumber||t.id)+'</strong></div><div><small>Origin</small><strong>'+escape(t.simulated?"Generated RP taxpayer":"Agency-created taxpayer")+'</strong></div></div>'+
 '<form id="p-activate-form" autocomplete="off">'+
 '<div class="field"><label for="p-login-name">Portal login name</label><input id="p-login-name" class="input" required maxlength="60" autocomplete="off" value="'+escape(suggestion)+'" placeholder="e.g. Jordan Vale"><small class="p-help">Use a unique fictional full name. A business may have a different portal login name from its registered business name.</small></div>'+
 '<div class="field"><label for="p-password">New portal password</label><input id="p-password" class="input" type="password" required minlength="10" maxlength="128" autocomplete="new-password" placeholder="At least 10 characters"></div>'+
 '<div class="field"><label for="p-confirm">Confirm portal password</label><input id="p-confirm" class="input" type="password" required minlength="10" maxlength="128" autocomplete="new-password" placeholder="Enter the password again"></div>'+
 '<label class="p-show"><input type="checkbox" id="p-show-password"> Show passwords while entering</label>'+
 '<div class="p-warning">This activates a new citizen login and grants access to this taxpayer’s existing RP financial and case records. The login must be given only to the intended player. Passwords are never saved in Firestore.</div>'+
 '<div class="p-error" role="alert" aria-live="polite"></div>'+
 '<div class="p-controls"><button type="button" class="button secondary" data-close>Cancel</button><button type="submit" class="button" id="p-submit">Create portal account</button></div>'+
 '</form></div>';
 const el=h.modal("Convert taxpayer to portal",body,root=>{
  root.querySelector("#p-show-password")?.addEventListener("change",e=>{
   const visible=e.currentTarget.checked;
   root.querySelector("#p-password").type=visible?"text":"password";
   root.querySelector("#p-confirm").type=visible?"text":"password";
  });
  root.querySelector("#p-activate-form")?.addEventListener("submit",async e=>{
   e.preventDefault();
   const button=root.querySelector("#p-submit");
   if(button.disabled)return;
   const portalName=root.querySelector("#p-login-name").value.trim().replace(/\s+/g," ");
   const password=root.querySelector("#p-password").value;
   const confirmation=root.querySelector("#p-confirm").value;
   const issue=root.querySelector(".p-error");
   issue.textContent="";
   if(!validateName(portalName)){issue.textContent="Enter a fictional login name using 3–60 letters, spaces, apostrophes or hyphens.";return;}
   if(password.length<10||password.length>128){issue.textContent="The password must be 10–128 characters long.";return;}
   if(password!==confirmation){issue.textContent="The passwords do not match.";return;}
   button.disabled=true;
   button.textContent="Activating account…";
   try{
    await call("activateTaxpayerPortal",{taxpayerId:t.id,portalName,password});
    root.querySelector("#p-password").value="";
    root.querySelector("#p-confirm").value="";
    root.remove();
    h.toast("Portal activated for "+portalName+". Share the login name and password securely with the intended player.");
    await h.reload();
   }catch(err){
    issue.textContent=err?.message||"Unable to activate the portal. Check Firebase Functions logs.";
   }finally{
    button.disabled=false;button.textContent="Create portal account";
   }
  });
 });
 return el;
}
