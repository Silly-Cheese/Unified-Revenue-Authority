import {call,changePassword,cleanName,validateName} from "./auth.js";
import {escapeHTML as escape} from "./documents.js";

export function portalStatus(t){
 if(t.ownerUid||t.ownerLinked)return "Portal linked";
 return t.status==="active"?"Ready to convert":"Unavailable";
}

function taxpayerSummary(t){
 return '<div class="p-summary"><div><small>Taxpayer</small><strong>'+escape(t.fullName)+'</strong></div>'+
 '<div><small>Reference</small><strong>'+escape(t.taxpayerNumber||t.id)+'</strong></div>'+
 '<div><small>Portal login</small><strong>'+escape(t.portalName||"Not linked")+'</strong></div></div>';
}

function openPasswordForm(h,{title,summary="",nameField="",current=false,action,pending,save,done}){
 const currentField=current?'<div class="field"><label for="p-current">Current password</label><input id="p-current" class="input" type="password" required autocomplete="current-password"></div>':"";
 return h.modal(title,'<div class="modal-body">'+summary+
 '<form id="p-password-form">'+nameField+currentField+
 '<div class="field"><label for="p-password">New password</label><input id="p-password" class="input" type="password" required minlength="10" maxlength="128" autocomplete="new-password" aria-describedby="p-password-help"><small id="p-password-help" class="p-help">Use 10–128 characters.</small></div>'+
 '<div class="field"><label for="p-confirm">Confirm new password</label><input id="p-confirm" class="input" type="password" required minlength="10" maxlength="128" autocomplete="new-password"></div>'+
 '<label class="p-show"><input type="checkbox" id="p-show-password"> Show passwords</label>'+
 '<div class="p-error" role="alert"></div>'+
 '<div class="p-controls"><button type="button" class="button secondary" data-close>Cancel</button><button type="submit" class="button">'+escape(action)+'</button></div>'+
 '</form></div>',root=>{
  const form=root.querySelector("#p-password-form");
  const button=form.querySelector('[type="submit"]');
  const name=form.querySelector("#p-login-name");
  const currentInput=form.querySelector("#p-current");
  const password=form.querySelector("#p-password");
  const confirmation=form.querySelector("#p-confirm");
  const fields=[currentInput,password,confirmation].filter(Boolean);
  const issue=form.querySelector(".p-error");
  (name||currentInput||password).focus();
  form.querySelector("#p-show-password").addEventListener("change",e=>{
   for(const field of fields)field.type=e.currentTarget.checked?"text":"password";
  });
  form.addEventListener("submit",async e=>{
   e.preventDefault();
   if(button.disabled)return;
   issue.textContent="";
   const portalName=cleanName(name?.value);
   if(name&&!validateName(portalName)){
    issue.textContent="Use a fictional login name of 3–60 letters, spaces, apostrophes or hyphens.";
    name.focus();
    return;
   }
   if(!password.value.trim()||password.value.length<10||password.value.length>128){
    issue.textContent="Use a password of 10–128 characters.";
    password.focus();
    return;
   }
   if(password.value!==confirmation.value){
    issue.textContent="The passwords do not match.";
    confirmation.focus();
    return;
   }
   button.disabled=true;
   button.textContent=pending;
   let result;
   try{
    result=await save({portalName,password:password.value,currentPassword:currentInput?.value});
   }catch(err){
    issue.textContent=h.authError?.(err)||err?.message||"Could not save the password. Try again.";
    if(!root.isConnected)h.toast(issue.textContent,true);
    return;
   }finally{
    button.disabled=false;
    button.textContent=action;
   }
   form.reset();
   root.remove();
   await done(result);
  });
 });
}

export function openPortalActivation(t,h){
 if(portalStatus(t)!=="Ready to convert"){
  h.toast("Only active taxpayers without a portal can be converted.",true);
  return;
 }
 const name=cleanName(t.fullName);
 const suggestion=validateName(name)&&name.toLowerCase()!=="christopher shelley"?name:"";
 return openPasswordForm(h,{
  title:"Create portal login",
  summary:taxpayerSummary(t)+'<p class="p-note">The player will sign in with the name and password you set here. Their existing taxpayer reference and history carry over.</p>',
  nameField:'<div class="field"><label for="p-login-name">Portal login name</label><input id="p-login-name" class="input" required maxlength="60" autocomplete="off" value="'+escape(suggestion)+'" placeholder="e.g. Jordan Vale"><small class="p-help">Choose a unique fictional name. It can differ from the taxpayer’s registered name.</small></div>',
  action:"Create portal login",
  pending:"Creating login…",
  save:({portalName,password})=>call("activateTaxpayerPortal",{taxpayerId:t.id,portalName,password}),
  done:async result=>{
   h.toast("Portal login created for "+result.data.portalName+".");
   await h.reload();
  }
 });
}

export function openPortalReset(t,h){
 if(portalStatus(t)!=="Portal linked"||!t.portalName||t.status!=="active")return;
 return openPasswordForm(h,{
  title:"Reset portal password",
  summary:taxpayerSummary(t)+'<p class="p-note">The player will use the new password with the same login name.</p>',
  action:"Reset password",
  pending:"Resetting password…",
  save:({password})=>call("resetConvertedPortalPassword",{taxpayerId:t.id,password}),
  done:()=>h.toast("Password reset for "+t.portalName+".")
 });
}

export function openPasswordChange(h){
 return openPasswordForm(h,{
  title:"Change your password",
  current:true,
  action:"Change password",
  pending:"Changing password…",
  save:({currentPassword,password})=>changePassword(currentPassword,password),
  done:()=>h.toast("Your password was changed.")
 });
}
