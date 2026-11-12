// Generation 4 — Compliance casework, audits, collections, appeals and investigations.
import {call} from "./auth.js";
export const casePages=["examinations","appeals","collections","investigations"];
let cases=[],officers=[],accounts=[],selectedStatus="all",search="";
const E=(v)=>String(v??"").replace(/[&<>"']/g,x=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[x]));
const cash=(c)=>"$"+(Number(c||0)/100).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
const date=(v)=>v?new Date(v).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}):"—";
const names={audit:"Examinations & audits",appeal:"Administrative appeals",collection:"Revenue collections",investigation:"Special investigations"};
const kindByPage={examinations:"audit",appeals:"appeal",collections:"collection",investigations:"investigation"};
const caseCodes={audit:"AUD",appeal:"APL",collection:"COL",investigation:"INV"};
const stages={
 audit:["open","information_requested","under_review","proposed_adjustment","resolved","closed"],
 appeal:["submitted","information_requested","under_review","awaiting_decision","resolved","closed"],
 collection:["open","contacted","arrangement_pending","resolved","closed"],
 investigation:["open","gathering","referred","closed"]
};
const nextStages={
 audit:{open:["information_requested","under_review","closed"],information_requested:["under_review","closed"],under_review:["information_requested","proposed_adjustment","resolved","closed"],proposed_adjustment:["under_review","resolved","closed"],resolved:["closed"]},
 appeal:{submitted:["under_review","information_requested"],information_requested:["under_review"],under_review:["information_requested","awaiting_decision","resolved"],awaiting_decision:["under_review","resolved"],resolved:["closed"]},
 collection:{open:["contacted","arrangement_pending","resolved","closed"],contacted:["arrangement_pending","resolved","closed"],arrangement_pending:["contacted","resolved","closed"],resolved:["closed"]},
 investigation:{open:["gathering","closed"],gathering:["referred","closed"],referred:["closed"]}
};
const label=(v)=>String(v||"").replaceAll("_"," ").replace(/\b\w/g,m=>m.toUpperCase());
const badge=(v)=>'<span class="c-pill '+E(v)+'">'+E(label(v))+'</span>';
const staff=(s)=>s.me?.role!=="citizen";
const supervisor=(s)=>["commissioner","supervisor"].includes(s.me?.role);
const examiner=(s)=>["commissioner","supervisor","auditor"].includes(s.me?.role);
const pageKind=(s)=>kindByPage[s.page]||"audit";
const currentList=(s)=>cases.filter(c=>{
 const q=search.toLowerCase();
 return c.kind===pageKind(s)&&(selectedStatus==="all"||c.status===selectedStatus)&&
 (c.caseNumber+" "+c.taxpayerName+" "+c.title).toLowerCase().includes(q);
});
const count=(kind,check)=>cases.filter(c=>c.kind===kind&&check(c)).length;
const statistic=(head,v,foot)=>'<div class="c-stat"><small>'+E(head)+'</small><strong>'+E(v)+'</strong><span>'+E(foot)+'</span></div>';
function empty(message){return '<div class="c-empty"><div class="c-empty-crest">URA</div><h3>No cases found</h3><p>'+E(message)+'</p></div>';}
export async function caseLoad(s){
 if(!casePages.includes(s.page))return;
 const promises=[
  call("listAgencyCases").then(r=>cases=r.data.cases||[]),
  call("getTreasuryData").then(r=>accounts=r.data.accounts||[])
 ];
 if(supervisor(s))promises.push(call("listAgencyOfficers").then(r=>officers=r.data.officers||[]));
 await Promise.all(promises);
}
export function casePageHTML(s,h){
 const kind=pageKind(s),rows=currentList(s);
 if(kind==="investigation"&&!examiner(s))return h.pageHeader("Restricted division","Special investigation records are accessible only to authorized examiners.");
 if(!staff(s)&&kind!=="appeal")return h.pageHeader("Staff division","Please use your taxpayer appeal portal.");
 const action=(kind==="appeal"||staff(s))?'<button class="button" id="c-new">+ '+(kind==="appeal"&&!staff(s)?"File appeal":"Open new case")+'</button>':"";
 const descriptive={
  audit:"Open examinations, request supporting information, record findings, and propose adjustments.",
  appeal:"Challenge a fictional assessment and submit evidence for administrative review.",
  collection:"Track overdue assessed balances, financial correspondence and payment arrangements.",
  investigation:"Document simulated compliance inquiries, evidence logs and controlled referrals."
 };
 const list=rows.map(c=>'<tr><td><strong>'+E(c.caseNumber)+'</strong><div class="tax-sub">'+E(c.title)+'</div></td><td>'+E(c.taxpayerName)+'</td><td>'+E(c.taxYear)+'</td><td>'+badge(c.status)+'</td><td>'+E(c.assignedToName||"Unassigned")+'</td><td>'+E(c.dueDate||"—")+'</td><td><button class="link" data-c-open="'+E(c.id)+'">Open file</button></td></tr>');
 return h.pageHeader(names[kind],descriptive[kind],action)+
 '<div class="c-banner"><div><span>UNIFIED REVENUE AUTHORITY / CASEWORK</span><h2>'+E(names[kind])+'</h2><p>Fictional administrative files with accountable actions, determinations, and linked financial records.</p></div><div class="c-banner-seal">URA</div></div>'+
 '<div class="c-stats">'+statistic("Total case files",count(kind,()=>true),"Registered files")+
 statistic("Active workload",count(kind,c=>!["closed","resolved"].includes(c.status)),"Cases in progress")+
 statistic("Resolved & closed",count(kind,c=>["closed","resolved"].includes(c.status)),"Completed casework")+'</div>'+
 '<div class="card card-pad"><div class="section-head"><h2>Casework register</h2><span class="pill gray">'+list.length+' shown</span></div>'+
 '<div class="toolbar c-tools"><input class="input" id="c-search" aria-label="Search cases" placeholder="Search reference, subject or taxpayer" value="'+E(search)+'">'+
 '<select class="input" id="c-filter" aria-label="Filter by status">'+
 [['all',"All statuses"],...stages[kind].map(x=>[x,label(x)])].map(([v,t])=>'<option value="'+E(v)+'" '+(v===selectedStatus?"selected":"")+'>'+E(t)+'</option>').join("")+'</select></div>'+
 (list.length?'<div class="table-wrap"><table class="table"><thead><tr><th>Case reference</th><th>Taxpayer</th><th>Year</th><th>Status</th><th>Assigned officer</th><th>Deadline</th><th></th></tr></thead><tbody>'+list.join("")+'</tbody></table></div>':
 empty("Open a formal RP case from a taxpayer account to create a complete case file."))+'</div>'+
 '<div class="tax-disclaimer">Fictional case management only · No legal effect · No real tax investigations or collections</div>';
}
function modal(h,title,body,actions,fn){return h.modal(title,'<div class="modal-body">'+body+'<div class="c-error" role="alert"></div></div><div class="modal-bottom"><button class="button secondary" data-close>Close</button>'+actions+'</div>',fn);}
function submit(h,el,button,run){
 button.disabled=true;Promise.resolve().then(run).catch(err=>{el.querySelector(".c-error").textContent=err?.message||"Action failed.";})
 .finally(()=>button.disabled=false);
}
function createDialog(s,h){
 const kind=pageKind(s);
 if(!accounts.length){h.toast("A previously accepted tax return is required before a case can be opened.",true);return;}
 modal(h,"Open "+names[kind].toLowerCase()+" case",
 '<div class="c-info">This opens an agency file connected to an assessed fictional taxpayer account. No real taxes or court matters are involved.</div>'+
 '<div class="field"><label>Taxpayer / assessed account</label><select class="input" id="c-taxaccount">'+
 accounts.map(a=>'<option value="'+E(a.id)+'">'+E(a.taxpayerName)+' · '+E(a.taxYear)+' · '+E(a.returnType)+'</option>').join("")+'</select></div>'+
 '<div class="field"><label>Case subject</label><input id="c-title" class="input" maxlength="140" placeholder="Describe this administrative matter"></div>'+
 '<div class="field"><label>Opening statement / explanation</label><textarea id="c-summary" class="input" maxlength="2500" rows="6" placeholder="Provide the factual context, supporting circumstances and requested actions."></textarea></div>'+
 (staff(s)?'<div class="c-form-grid"><div class="field"><label>Priority</label><select id="c-priority" class="input"><option value="standard">Standard</option><option value="priority">Priority</option><option value="urgent">Urgent</option></select></div><div class="field"><label>Target date</label><input id="c-due" class="input" type="date"></div></div>':""),
 '<button class="button" id="c-confirm">Open case file</button>',el=>{
 const button=el.querySelector("#c-confirm");
 button.addEventListener("click",()=>submit(h,el,button,async()=>{
  const payload={kind,taxAccountId:el.querySelector("#c-taxaccount").value,
   title:el.querySelector("#c-title").value,summary:el.querySelector("#c-summary").value};
  if(staff(s)){payload.priority=el.querySelector("#c-priority").value;payload.dueDate=el.querySelector("#c-due").value;}
  await call("createAgencyCase",payload);
  el.remove();h.toast("Formal case file opened.");await h.reload();
 }));
 });
}
async function viewFile(s,h,id){
 let item;
 try{item=(await call("getAgencyCase",{caseId:id})).data;}catch(err){h.toast(err.message,true);return;}
 const c=item.case,caseEvents=item.events||[],notices=item.notices||[];
 const sections=[
  ["Taxpayer",c.taxpayerName],["Reference",c.caseNumber],["Tax period",c.taxYear+" · "+c.returnType],
  ["Status",label(c.status)],["Assigned officer",c.assignedToName||"Unassigned"],
  ["Opened",date(c.createdAt)],["Due date",c.dueDate||"Not assigned"],["Priority",label(c.priority)]
 ];
 const canAct=staff(s);
 let body='<div class="c-case-head"><div class="eyebrow">OFFICIAL CASE FILE · RP</div><h3>'+E(c.title)+'</h3><p>'+E(c.caseNumber)+'</p></div>'+
 '<div class="c-details">'+sections.map(([a,b])=>'<div><small>'+E(a)+'</small><strong>'+E(b)+'</strong></div>').join("")+'</div>'+
 '<h3 class="c-subtitle">Opening statement</h3><div class="c-statement">'+E(c.summary)+'</div>'+
 (c.proposalStatus?'<div class="c-info"><strong>Adjustment proposal:</strong> '+E(label(c.proposalStatus))+
 ' · Proposed tax: '+cash(c.proposedTaxDueCents)+'<br>'+E(c.proposalReason||"")+'</div>':"")+
 (c.determinationReason?'<div class="c-info"><strong>Recorded determination:</strong> '+E(c.determinationReason)+'</div>':"")+
 '<div class="c-tabs-title"><h3>Case activity & correspondence</h3><span>'+caseEvents.length+' events</span></div>'+
 (caseEvents.length?'<div class="c-timeline">'+caseEvents.map(ev=>'<div class="c-event"><div class="c-event-dot"></div><div><strong>'+E(label(ev.kind))+'</strong><small>'+E(ev.actorName||"URA")+' · '+date(ev.createdAt)+'</small><p>'+E(ev.body)+'</p></div></div>').join("")+'</div>':
 '<div class="c-statement">No case activity has been recorded yet.</div>')+
 '<div class="c-tabs-title"><h3>Official simulation notices</h3><span>'+notices.length+' issued</span></div>'+
 (notices.length?notices.map(n=>'<button class="c-notice" data-c-notice="'+E(n.id)+'"><strong>'+E(n.title)+'</strong><small>'+date(n.createdAt)+' · View letter</small></button>').join(""):
 '<div class="c-statement">No taxpayer notices have been issued.</div>')+
 (c.status!=="closed"?'<div class="c-case-actions"><h3>Work this case</h3><p>Choose an authorized action. Each action is recorded in the permanent case timeline.</p>'+
 '<div class="c-action-grid"><button class="button secondary" id="c-note-action">Add correspondence</button>'+
 (canAct?'<button class="button secondary" id="c-notice-action">Issue notice</button><button class="button secondary" id="c-status-action">Update status</button>':"")+
 (supervisor(s)?'<button class="button secondary" id="c-assign-action">Assign officer</button>':"")+
 (examiner(s)&&["audit","appeal"].includes(c.kind)&&["under_review","proposed_adjustment","awaiting_decision"].includes(c.status)&&c.proposalStatus!=="pending"?
 '<button class="button secondary" id="c-adjust-action">Propose tax adjustment</button>':"")+
 (supervisor(s)&&c.proposalStatus==="pending"?'<button class="button" id="c-determine-action">Determine adjustment</button>':"")+'</div></div>':"")+
 '<div class="c-smallprint">Fictional administrative records. All figures and legal procedures exist only within the simulation.</div>';
 const el=modal(h,"Case file · "+c.caseNumber,body,'',el=>{
  el.querySelectorAll("[data-c-notice]").forEach(btn=>btn.addEventListener("click",()=>{
   const notice=notices.find(n=>n.id===btn.dataset.cNotice);
   if(!notice)return;
   h.modal("Official simulation correspondence",'<div class="modal-body"><div class="c-letter"><div class="eyebrow">URA / FICTIONAL ROLEPLAY</div><h3>'+E(notice.title)+'</h3><p>'+E(notice.body).replaceAll("\n","<br>")+'</p><div class="c-smallprint">Issued '+date(notice.createdAt)+' by '+E(notice.issuedByName)+'</div></div></div><div class="modal-bottom"><button class="button secondary" data-close>Close</button></div>');
  }));
  const open=(id,fn)=>el.querySelector(id)?.addEventListener("click",()=>{el.remove();fn(s,h,c);});
  open("#c-note-action",noteDialog);
  open("#c-notice-action",noticeDialog);
  open("#c-status-action",statusDialog);
  open("#c-assign-action",assignDialog);
  open("#c-adjust-action",adjustDialog);
  open("#c-determine-action",determineDialog);
 });
 return el;
}
function noteDialog(s,h,c){
 modal(h,"Add case correspondence",
 '<div class="c-info"><strong>'+E(c.caseNumber)+'</strong> · '+E(c.taxpayerName)+'</div>'+
 '<div class="field"><label>Case memo or supporting statement</label><textarea id="c-body" class="input" rows="7" maxlength="2500" placeholder="Record findings, requests, or correspondence in detail."></textarea></div>'+
 (staff(s)?'<div class="field"><label>Visibility</label><select id="c-visibility" class="input"><option value="internal">Internal staff note</option><option value="taxpayer">Share with taxpayer</option></select></div>':""),
 '<button class="button" id="c-confirm">Add case note</button>',el=>{
 const btn=el.querySelector("#c-confirm");
 btn.addEventListener("click",()=>submit(h,el,btn,async()=>{
  await call("addAgencyCaseNote",{caseId:c.id,body:el.querySelector("#c-body").value,
   visibility:el.querySelector("#c-visibility")?.value||"taxpayer"});
  el.remove();h.toast("Case correspondence recorded.");await h.reload();
 }));
 });
}
function noticeDialog(s,h,c){
 modal(h,"Issue a fictional agency notice",
 '<div class="c-info">The recipient sees this notice within their own URA case portal. The notice is explicitly marked as fictional.</div>'+
 '<div class="field"><label>Notice classification</label><select id="c-kind" class="input">'+[
 ["request_information","Request for information"],["proposed_adjustment","Proposed tax adjustment"],
 ["decision","Administrative determination"],["collection_notice","Collections correspondence"],
 ["general","General agency notice"]].map(([v,t])=>'<option value="'+v+'">'+t+'</option>').join("")+'</select></div>'+
 '<div class="field"><label>Notice title</label><input id="c-title" class="input" maxlength="160" placeholder="Official subject heading"></div>'+
 '<div class="field"><label>Notice explanation</label><textarea id="c-body" class="input" rows="7" maxlength="3500" placeholder="Provide the reason for the notice, applicable fictional findings, requested response and timeline."></textarea></div>',
 '<button class="button" id="c-confirm">Issue notice</button>',el=>{
 const btn=el.querySelector("#c-confirm");
 btn.addEventListener("click",()=>submit(h,el,btn,async()=>{
  await call("issueAgencyNotice",{caseId:c.id,type:el.querySelector("#c-kind").value,
   title:el.querySelector("#c-title").value,body:el.querySelector("#c-body").value});
  el.remove();h.toast("Fictional notice issued.");await h.reload();
 }));
 });
}
function statusDialog(s,h,c){
 const stagesAvailable=nextStages[c.kind]?.[c.status]||[];
 if(!stagesAvailable.length){h.toast("No additional workflow stages are available.",true);return;}
 modal(h,"Advance administrative case",
 '<div class="c-info">'+E(c.caseNumber)+' · Current state: <strong>'+E(label(c.status))+'</strong></div>'+
 '<div class="field"><label>Next workflow stage</label><select id="c-next" class="input">'+stagesAvailable.map(v=>'<option value="'+v+'">'+E(label(v))+'</option>').join("")+'</select></div>'+
 '<div class="field"><label>Written explanation</label><textarea id="c-reason" class="input" rows="5" maxlength="1200" placeholder="Describe why this status change is appropriate."></textarea></div>',
 '<button class="button" id="c-confirm">Update case status</button>',el=>{
 const btn=el.querySelector("#c-confirm");
 btn.addEventListener("click",()=>submit(h,el,btn,async()=>{
  await call("advanceAgencyCase",{caseId:c.id,status:el.querySelector("#c-next").value,
   reason:el.querySelector("#c-reason").value});
  el.remove();h.toast("Case status updated.");await h.reload();
 }));
 });
}
function assignDialog(s,h,c){
 if(!officers.length){h.toast("No active officers are available.",true);return;}
 modal(h,"Assign responsible officer",
 '<div class="c-info">'+E(c.caseNumber)+' · Select a registered employee to assign responsibility for this case.</div>'+
 '<div class="field"><label>Agency officer</label><select id="c-officer" class="input">'+
 officers.filter(p=>c.kind!=="investigation"||["auditor","supervisor","commissioner"].includes(p.role))
 .map(o=>'<option value="'+E(o.uid)+'">'+E(o.name)+' · '+E(label(o.role))+'</option>').join("")+'</select></div>',
 '<button class="button" id="c-confirm">Assign case</button>',el=>{
 const btn=el.querySelector("#c-confirm");
 btn.addEventListener("click",()=>submit(h,el,btn,async()=>{
  await call("assignAgencyCase",{caseId:c.id,uid:el.querySelector("#c-officer").value});
  el.remove();h.toast("Agency case assigned.");await h.reload();
 }));
 });
}
function adjustDialog(s,h,c){
 const acct=accounts.find(a=>a.id===c.taxAccountId);
 modal(h,"Propose tax assessment adjustment",
 '<div class="c-info"><strong>'+E(c.caseNumber)+'</strong><br>Current simulated assessed tax: '+cash(acct?.assessedCents)+'. This proposal requires separate approval and will not change balances immediately.</div>'+
 '<div class="field"><label>Revised tax liability ($)</label><input id="c-revised" class="input" type="number" step=".01" min="0" max="999999999.99" value="'+((acct?.assessedCents||0)/100).toFixed(2)+'"></div>'+
 '<div class="field"><label>Detailed examination rationale</label><textarea id="c-reason" class="input" rows="6" maxlength="2000" placeholder="Explain evidence, findings, authority within the fictional code and revised calculation."></textarea></div>',
 '<button class="button" id="c-confirm">Submit adjustment proposal</button>',el=>{
 const btn=el.querySelector("#c-confirm");
 btn.addEventListener("click",()=>submit(h,el,btn,async()=>{
  await call("proposeAgencyAdjustment",{caseId:c.id,revisedTaxDollars:el.querySelector("#c-revised").value,
   reason:el.querySelector("#c-reason").value});
  el.remove();h.toast("Adjustment proposal submitted for supervisory decision.");await h.reload();
 }));
 });
}
function determineDialog(s,h,c){
 modal(h,"Determine proposed tax adjustment",
 '<div class="c-info">Proposal: <strong>'+cash(c.proposedTaxDueCents)+'</strong> revised tax liability.<br>'+E(c.proposalReason||"")+'</div>'+
 '<div class="field"><label>Administrative decision</label><select id="c-decision" class="input"><option value="approve">Approve and post Treasury adjustment</option><option value="deny">Deny proposed adjustment</option></select></div>'+
 '<div class="field"><label>Formal written determination</label><textarea id="c-reason" class="input" rows="6" maxlength="2000" placeholder="Record supporting facts and final legal reasoning within the fictional tax rules."></textarea></div>'+
 '<div class="c-info">Approval creates a permanent adjustment journal and a fictional determination notice. It does not transfer real money.</div>',
 '<button class="button" id="c-confirm">Record determination</button>',el=>{
 const btn=el.querySelector("#c-confirm");
 btn.addEventListener("click",()=>submit(h,el,btn,async()=>{
  await call("determineAgencyAdjustment",{caseId:c.id,decision:el.querySelector("#c-decision").value,
   reason:el.querySelector("#c-reason").value});
  el.remove();h.toast("Administrative determination recorded and ledger updated if approved.");await h.reload();
 }));
 });
}
export function casePageBind(s,h){
 if(!casePages.includes(s.page))return;
 document.getElementById("c-new")?.addEventListener("click",()=>createDialog(s,h));
 document.getElementById("c-filter")?.addEventListener("change",ev=>{selectedStatus=ev.target.value;h.renderShell();});
 document.getElementById("c-search")?.addEventListener("change",ev=>{search=ev.target.value;h.renderShell();});
 document.querySelectorAll("[data-c-open]").forEach(el=>el.addEventListener("click",()=>viewFile(s,h,el.dataset.cOpen)));
}
