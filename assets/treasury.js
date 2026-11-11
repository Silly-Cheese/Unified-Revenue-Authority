// Generation 3 — Treasury & Financial Operations (fictional RP).
import {call} from "./auth.js";
export const treasuryPages=["treasury","payments","refunds","plans","ledger"];
let data={accounts:[],receipts:[],refunds:[],plans:[],journals:[]},overview=null;
let selected="";let search="";let busy=false;
const escape=(value)=>String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
const dollars=(n)=>"$"+(Number(n||0)/100).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
const date=(val)=>{if(!val)return "—";const d=val?.toDate?val.toDate():new Date(val);return Number.isNaN(d.getTime())?"—":d.toLocaleDateString("en-US",{year:"numeric",month:"short",day:"numeric"});};
const status=(value)=>'<span class="t-status t-'+escape(value)+'">'+escape(String(value||"unknown").replaceAll("_"," "))+'</span>';
const isStaff=(s)=>s.me&&s.me.role!=="citizen";
const isSupervisor=(s)=>["supervisor","commissioner"].includes(s.me?.role);
const allowReconcile=(s)=>["supervisor","commissioner","auditor"].includes(s.me?.role);
const accounts=()=>data.accounts||[];
const getSelected=()=>accounts().find(a=>a.id===selected)||accounts()[0];
const accountLabel=(a)=>a.taxpayerName+" · "+a.taxYear+" · "+(a.returnType==="business"?"Business":"Individual");
const row=([left,right])=>'<div class="t-row"><span>'+escape(left)+'</span><strong>'+escape(right)+'</strong></div>';
const metric=(title,value,foot)=>'<div class="t-metric"><small>'+escape(title)+'</small><strong>'+escape(value)+'</strong><span>'+escape(foot)+'</span></div>';
const table=(heads,rows,emptyText)=>rows.length?'<div class="table-wrap"><table class="table"><thead><tr>'+heads.map(v=>'<th>'+escape(v)+'</th>').join("")+'</tr></thead><tbody>'+rows.join("")+'</tbody></table></div>':empty(emptyText);
const empty=(message)=>'<div class="t-empty"><div class="t-empty-icon">URA</div><h3>No records yet</h3><p>'+escape(message)+'</p></div>';
const panel=(title,body,action="")=>'<div class="card card-pad"><div class="section-head"><h2>'+escape(title)+'</h2>'+action+'</div>'+body+'</div>';
function accountPicker(){
 const all=accounts();
 return all.length?'<div class="t-picker"><label for="treasury-account">Tax account</label><select class="input" id="treasury-account">'+all.map(a=>'<option value="'+escape(a.id)+'" '+(selected===a.id?"selected":"")+'>'+escape(accountLabel(a))+'</option>').join("")+'</select></div>':"";
}
function requireAccount(h){const a=getSelected();if(!a){h.toast("An accepted tax return is required to establish a Treasury account.",true);return null;}return a;}
function moneyCards(a){
 return '<div class="t-metrics">'+metric("Assessed tax",dollars(a?.assessedCents),"Formal fictional liability")+
 metric("Remaining balance",dollars(a?.outstandingCents),"Payable on current account")+
 metric("Available credit",dollars(a?.refundAvailableCents),"Unreserved refundable amount")+
 metric("Payments received",dollars(a?.directPaymentsCents),"Simulated direct receipts")+'</div>';
}
export async function treasuryLoad(state){
 if(!treasuryPages.includes(state.page))return;
 const work=[call("getTreasuryData").then(r=>{data=r.data; if(!accounts().some(a=>a.id===selected))selected=accounts()[0]?.id||"";})];
 if(isStaff(state))work.push(call("getTreasuryOverview").then(r=>overview=r.data));
 await Promise.all(work);
}
function treasuryPage(s,h){
 const a=getSelected();
 const chart=overview?.chart||{};
 const dashboard='<div class="t-hero"><div><div class="eyebrow">URA / TREASURY BUREAU</div><h2>Every figure has a journal.</h2><p>Review simulated tax balances, collections, credits and disbursements through a traceable accounting system.</p></div><span class="t-hero-symbol">₮</span></div>';
 const control=overview?'<div class="t-ledger-strip"><div><small>General ledger control</small><strong>'+dollars(overview.control?.totalDebitCents)+'</strong><span>Aggregate journal debits</span></div><div><small>Aggregate journal credits</small><strong>'+dollars(overview.control?.totalCreditCents)+'</strong><span>'+Number(overview.control?.postedJournals||0)+' posted journals</span></div><div><small>Reconciliation</small><strong>'+status(overview.balanced?"balanced":"attention")+'</strong><span>Control-level check</span></div></div>':"";
 return h.pageHeader("Treasury command","Financial operations, taxpayer balances and fictional government revenue in one place.")+
 dashboard+accountPicker()+moneyCards(a)+control+
 '<div class="grid-two"><div>'+panel("Current tax account",a?'<div class="t-account-summary">'+[
 ["Registered taxpayer",a.taxpayerName],["Tax year and type",a.taxYear+" · "+a.returnType],
 ["Tax declared as prepaid",dollars(a.declaredPaymentsCents)],["Fictional refunds paid",dollars(a.refundsDisbursedCents)],
 ["Reserved refunds",dollars(a.reservedRefundCents)],["Available to request",dollars(a.refundAvailableCents)],
 ["Tax account reference",a.id]
 ].map(x=>row(x)).join("")+'</div>':empty("Submit and approve a fictional tax return first."),
 a?'<button class="button secondary" id="t-new-payment">Record payment</button>':"")+'</div><div>'+
 panel("Operational activity",'<div class="t-actions">'+[
 ["payments","Receipts & payment desk","Record simulated taxpayer payments"],
 ["refunds","Refund authorization","Request, approve and disburse credits"],
 ["plans","Installment arrangements","Manage tax balance payment plans"],
 ...(isStaff(s)?[["ledger","General ledger","Inspect balanced journal entries"]]:[])
 ].map(x=>'<a href="#'+x[0]+'" class="t-action"><strong>'+escape(x[1])+'</strong><small>'+escape(x[2])+'</small></a>').join("")+'</div>')+'</div></div>'+
 '<p class="tax-disclaimer">RP-only currency. No real payment processing, banking connection or government tax service.</p>';
}
function paymentsPage(s,h){
 const rows=(data.receipts||[]).filter(r=>(r.taxpayerName+" "+r.id+" "+r.taxYear).toLowerCase().includes(search.toLowerCase()))
  .map(r=>'<tr><td><strong>RCPT-'+escape(r.id.slice(0,8).toUpperCase())+'</strong><div class="tax-sub">'+date(r.createdAt)+'</div></td><td>'+escape(r.taxpayerName)+'</td><td>'+escape(r.taxYear)+'</td><td>'+escape(r.method.replaceAll("_"," "))+'</td><td class="tax-mono">'+dollars(r.amountCents)+'</td><td>'+status(r.status)+'</td></tr>');
 return h.pageHeader("Payments & receipts","Post fictional tax payments with automatic balance updates and a double-entry journal.",
  '<button id="t-new-payment" class="button">+ Record payment</button>')+
 accountPicker()+moneyCards(getSelected())+
 panel("Posted payment receipts",'<div class="toolbar"><input class="input" id="t-search" value="'+escape(search)+'" placeholder="Search receipts or taxpayers" aria-label="Search receipts"></div>'+
 table(["Receipt","Taxpayer","Year","Method","Amount","Status"],rows,"Post a fictional payment to create the first receipt."))+
 '<p class="tax-disclaimer">Payment buttons generate simulated accounting entries only. No actual bank or card payments occur.</p>';
}
function refundsPage(s,h){
 const a=getSelected(),all=data.refunds||[];
 const rows=all.filter(x=>(x.taxpayerName+" "+x.id).toLowerCase().includes(search.toLowerCase()))
 .map(r=>'<tr><td><strong>RF-'+escape(r.id.slice(0,8).toUpperCase())+'</strong><div class="tax-sub">'+date(r.createdAt)+'</div></td><td>'+escape(r.taxpayerName)+'</td><td>'+dollars(r.amountCents)+'</td><td>'+status(r.status)+'</td><td><button class="link" data-t-refund="'+escape(r.id)+'">Review</button></td></tr>');
 return h.pageHeader("Refund authorization","Manage taxpayer credit claims through approvals and controlled simulated disbursements.",
  '<button class="button" id="t-refund-new">+ Request refund</button>')+
 '<div class="t-metrics">'+metric("Pending requests",all.filter(r=>r.status==="requested").length,"Awaiting authorized review")+
 metric("Authorized",all.filter(r=>r.status==="authorized").length,"Reserved but not paid")+
 metric("Refunds disbursed",dollars(all.filter(r=>r.status==="disbursed").reduce((n,r)=>n+r.amountCents,0)),"Completed fictional payments")+'</div>'+
 panel("Refund case register",'<div class="toolbar"><input class="input" id="t-search" value="'+escape(search)+'" placeholder="Search refund requests"></div>'+
 table(["Reference","Taxpayer","Requested","Decision status",""],rows,"Available credits can be requested for refund after a return is assessed."))+
 (a?'<div class="t-info"><strong>Current account credit:</strong> '+dollars(a.refundAvailableCents)+' available, '+dollars(a.reservedRefundCents)+' reserved.</div>':"");
}
function plansPage(s,h){
 const all=data.plans||[];
 const rows=all.filter(x=>(x.taxpayerName+" "+x.id).toLowerCase().includes(search.toLowerCase())).map(p=>
 '<tr><td><strong>PLAN-'+escape(p.id.slice(0,8).toUpperCase())+'</strong><div class="tax-sub">'+date(p.createdAt)+'</div></td><td>'+escape(p.taxpayerName)+'</td><td>'+dollars(p.amountCents)+'</td><td>'+p.installmentCount+'</td><td>'+status(p.status)+'</td><td><button class="link" data-t-plan="'+escape(p.id)+'">View</button></td></tr>');
 return h.pageHeader("Payment arrangements","Review and administer installment plans for fictional outstanding assessments.",
 '<button class="button" id="t-plan-new">+ Apply for installment plan</button>')+
 '<div class="t-metrics">'+metric("Applications",all.filter(p=>p.status==="requested").length,"Awaiting determination")+
 metric("Active arrangements",all.filter(p=>p.status==="active").length,"Approved payment schedules")+
 metric("Completed arrangements",all.filter(p=>p.status==="completed").length,"Paid in full")+'</div>'+
 panel("Installment agreements",'<div class="toolbar"><input class="input" id="t-search" value="'+escape(search)+'" placeholder="Search taxpayer or plan"></div>'+
 table(["Plan","Taxpayer","Starting balance","Installments","Status",""],rows,"Request an installment plan for an assessed balance."))+
 '<div class="t-info">Payments applied to an active plan update the plan’s total paid. The installment schedule is fictional and does not charge automatic real payments.</div>';
}
function ledgerPage(s,h){
 if(!isStaff(s))return h.pageHeader("Restricted","Personnel credentials required.");
 const chart=overview?.chart||{},journals=data.journals||[];
 const chartRows=Object.entries({1000:"Treasury cash",1100:"Tax receivables",2100:"Taxpayer credits",4100:"Assessed revenue"})
 .map(([k,name])=>'<tr><td><strong>'+k+'</strong></td><td>'+escape(name)+'</td><td>'+dollars(chart[k]?.debitCents)+'</td><td>'+dollars(chart[k]?.creditCents)+'</td><td class="tax-mono">'+(chart[k]?.balanceCents<0?"−":"")+dollars(Math.abs(chart[k]?.balanceCents||0))+'</td></tr>');
 const journalRows=journals.map(j=>'<tr><td><strong>'+escape(j.id.slice(0,16))+'</strong><div class="tax-sub">'+date(j.postedAt)+'</div></td><td>'+escape(j.kind)+'</td><td>'+escape(j.description)+'</td><td>'+dollars(j.totalDebitCents)+'</td><td>'+dollars(j.totalCreditCents)+'</td><td><button class="link" data-t-journal="'+escape(j.id)+'">View</button></td></tr>');
 return h.pageHeader("Treasury general ledger","Trace every fictional assessment, payment and refund through balanced journals.",
 (allowReconcile(s)?'<button class="button" id="t-reconcile">Run reconciliation</button>':""))+
 '<div class="t-ledger-strip"><div><small>Posted journal debits</small><strong>'+dollars(overview?.control?.totalDebitCents)+'</strong></div><div><small>Posted journal credits</small><strong>'+dollars(overview?.control?.totalCreditCents)+'</strong></div><div><small>Accounting control</small>'+status(overview?.balanced?"balanced":"attention")+'</div></div>'+
 panel("Government chart of accounts",table(["Account","Classification","Debits","Credits","Net balance"],chartRows,"No chart balances."))+
 '<div style="height:18px"></div>'+panel("Journal register",table(["Journal ID","Type","Reference","Debits","Credits",""],journalRows,"Accept a return or post a simulated payment to create a journal."))+
 '<p class="tax-disclaimer">Reconciliation checks stored journal and chart balances; no external banking account is involved.</p>';
}
export function treasuryPageHTML(s,h){
 if(s.page==="treasury")return treasuryPage(s,h);
 if(s.page==="payments")return paymentsPage(s,h);
 if(s.page==="refunds")return refundsPage(s,h);
 if(s.page==="plans")return plansPage(s,h);
 if(s.page==="ledger")return ledgerPage(s,h);
 return "";
}
function modal(h,title,body,buttons,cb){
 return h.modal(title,'<div class="modal-body">'+body+'<div class="t-dialog-error" role="alert"></div></div><div class="modal-bottom"><button class="button secondary" data-close>Cancel</button>'+buttons+'</div>',cb);
}
function error(el,err){el.querySelector(".t-dialog-error").textContent=String(err?.message||err||"Could not complete the action.");}
function withWait(el,btn,fn){
 btn.disabled=true;
 Promise.resolve().then(fn).catch(err=>error(el,err)).finally(()=>btn.disabled=false);
}
function paymentDialog(h){
 const a=requireAccount(h);if(!a)return;
 modal(h,"Post simulated tax payment",'<div class="t-info"><strong>'+escape(accountLabel(a))+'</strong><br>Outstanding: '+dollars(a.outstandingCents)+'</div>'+
 '<div class="field"><label for="t-amount">Payment amount ($)</label><input class="input" id="t-amount" type="number" step=".01" min=".01" max="'+(a.outstandingCents/100)+'" required></div>'+
 '<div class="field"><label for="t-method">Payment method</label><select class="input" id="t-method">'+
 [["simulated_transfer","Fictional electronic transfer"],["simulated_check","Fictional check"],["simulated_cash","Fictional cash"],["simulated_money_order","Fictional money order"]].map(([k,v])=>'<option value="'+k+'">'+v+'</option>').join("")+'</select></div>'+
 '<div class="field"><label for="t-note">Payment memorandum</label><input class="input" id="t-note" maxlength="350" value="Fictional taxpayer remittance" required></div>'+
 '<div class="t-info">Posting creates a receipt, reduces assessed balance, and records two offsetting ledger entries. No actual funds are transferred.</div>',
 '<button class="button" id="t-confirm">Post payment</button>',el=>{
 const btn=el.querySelector("#t-confirm");
 btn.addEventListener("click",()=>withWait(el,btn,async()=>{
  await call("recordTreasuryPayment",{taxpayerId:a.taxpayerId,taxYear:a.taxYear,returnType:a.returnType,
   amount:el.querySelector("#t-amount").value,method:el.querySelector("#t-method").value,
   description:el.querySelector("#t-note").value});
  el.remove();h.toast("Payment posted to fictional ledger.");await h.reload();
 }));
 });
}
function refundRequestDialog(h){
 const a=requireAccount(h);if(!a)return;
 modal(h,"Request tax credit refund",'<div class="t-info">Unreserved credit available: <strong>'+dollars(a.refundAvailableCents)+'</strong></div>'+
 '<div class="field"><label>Requested amount ($)</label><input id="t-amount" class="input" type="number" min=".01" max="'+(a.refundAvailableCents/100)+'" step=".01"></div>'+
 '<div class="field"><label>Refund request explanation</label><textarea id="t-note" class="input" rows="4" maxlength="1000" placeholder="Reason for this roleplay credit refund"></textarea></div>',
 '<button class="button" id="t-confirm">Submit refund request</button>',el=>{
 const btn=el.querySelector("#t-confirm");
 btn.addEventListener("click",()=>withWait(el,btn,async()=>{
  await call("requestTreasuryRefund",{taxpayerId:a.taxpayerId,taxYear:a.taxYear,returnType:a.returnType,
   amount:el.querySelector("#t-amount").value,reason:el.querySelector("#t-note").value});
  el.remove();h.toast("Refund request submitted.");await h.reload();
 }));
 });
}
function refundReviewDialog(h,s,r){
 let actions="";
 if(isSupervisor(s)&&r.status==="requested")actions='<div class="t-modal-actions"><button class="button secondary" data-refund-decision="deny">Deny request</button><button class="button" data-refund-decision="approve">Authorize credit</button></div>';
 if(isSupervisor(s)&&r.status==="authorized")actions='<button class="button secondary" data-refund-decision="cancel">Cancel authorization</button><button class="button" data-refund-decision="disburse">Disburse fictional refund</button>';
 modal(h,"Refund file · RF-"+r.id.slice(0,8).toUpperCase(),
 '<div class="t-account-summary">'+[["Taxpayer",r.taxpayerName],["Tax year",r.taxYear],["Amount",dollars(r.amountCents)],
 ["Status",r.status],["Requested",date(r.createdAt)],["Original reason",r.reason]].map(row).join("")+'</div>'+
 (r.reviewReason?'<div class="t-info">Determination: '+escape(r.reviewReason)+'</div>':"")+
 (actions?'<div class="field"><label>Decision / disbursement reason</label><textarea id="t-decision-note" class="input" rows="3" placeholder="Document the reason for this action"></textarea></div>':"")+
 '<div class="t-info">All refund disbursements are fictional. Authorization reserves available credits before disbursement.</div>',actions,el=>{
 el.querySelectorAll("[data-refund-decision]").forEach(btn=>btn.addEventListener("click",()=>withWait(el,btn,async()=>{
  const act=btn.dataset.refundDecision,reason=el.querySelector("#t-decision-note").value;
  if(act==="disburse")await call("disburseTreasuryRefund",{refundId:r.id,reason});
  else if(act==="cancel")await call("cancelTreasuryRefund",{refundId:r.id,reason});
  else await call("decideTreasuryRefund",{refundId:r.id,decision:act,reason});
  el.remove();h.toast("Refund file updated.");await h.reload();
 })));
 });
}
function planRequestDialog(h){
 const a=requireAccount(h);if(!a)return;
 modal(h,"Apply for installment arrangement",
 '<div class="t-info">Outstanding assessed tax: <strong>'+dollars(a.outstandingCents)+'</strong></div>'+
 '<div class="field"><label>Number of monthly installments</label><select class="input" id="t-count">'+[2,3,4,6,8,10,12,18,24].map(n=>'<option value="'+n+'" '+(n===6?"selected":"")+'>'+n+' months</option>').join("")+'</select></div>'+
 '<div class="field"><label>Financial circumstances / reason</label><textarea id="t-plan-reason" rows="4" maxlength="1000" class="input" placeholder="Describe the need for an installment agreement"></textarea></div>'+
 '<div class="t-info">Due dates and equal payment amounts are generated automatically; no real deductions or bank charges are made.</div>',
 '<button class="button" id="t-confirm">Submit application</button>',el=>{
 const btn=el.querySelector("#t-confirm");
 btn.addEventListener("click",()=>withWait(el,btn,async()=>{
  await call("requestTreasuryPlan",{taxpayerId:a.taxpayerId,taxYear:a.taxYear,returnType:a.returnType,
    installmentCount:Number(el.querySelector("#t-count").value),reason:el.querySelector("#t-plan-reason").value});
  el.remove();h.toast("Installment arrangement requested.");await h.reload();
 }));
 });
}
function planReviewDialog(h,s,p){
 const actions=isSupervisor(s)&&p.status==="requested"?
 '<button class="button secondary" data-plan-decision="deny">Deny</button><button class="button" data-plan-decision="approve">Approve plan</button>':"";
 const schedule=(p.schedule||[]).map(i=>'<div class="t-row"><span>'+escape(i.dueDate)+'</span><strong>'+dollars(i.amountCents)+'</strong></div>').join("");
 modal(h,"Installment arrangement · "+p.id.slice(0,8).toUpperCase(),
 '<div class="t-account-summary">'+[["Taxpayer",p.taxpayerName],["Original liability",dollars(p.amountCents)],["Amount paid",dollars(p.paidCents)],
 ["Remaining scheduled",dollars(Math.max(0,p.amountCents-(p.paidCents||0)))],["Status",p.status]].map(row).join("")+'</div>'+
 '<h3 style="margin:18px 0 8px;font-size:14px">Payment schedule</h3>'+schedule+
 (actions?'<div class="field" style="margin-top:15px"><label>Decision reasoning</label><textarea id="t-plan-note" rows="3" class="input" placeholder="Formal justification for this decision"></textarea></div>':""),
 actions,el=>{el.querySelectorAll("[data-plan-decision]").forEach(btn=>btn.addEventListener("click",()=>withWait(el,btn,async()=>{
  await call("decideTreasuryPlan",{planId:p.id,decision:btn.dataset.planDecision,
   reason:el.querySelector("#t-plan-note").value});
  el.remove();h.toast("Plan determination recorded.");await h.reload();
 })));});
}
function reconcileDialog(h){
 modal(h,"Run treasury reconciliation",
 '<div class="t-info">Validate that the simulated General Ledger’s aggregate debits and credits match, and that the chart of accounts nets to zero. This does not contact a financial institution.</div>'+
 '<div class="field" style="margin-top:15px"><label>Reconciliation memo</label><textarea id="t-reconcile-note" rows="3" class="input">Monthly general ledger integrity review</textarea></div>',
 '<button class="button" id="t-confirm">Run reconciliation</button>',el=>{
 const btn=el.querySelector("#t-confirm");
 btn.addEventListener("click",()=>withWait(el,btn,async()=>{
  const result=await call("reconcileTreasury",{notes:el.querySelector("#t-reconcile-note").value});
  el.remove();h.toast(result.data.balanced?"Ledger control balances verified.":"Ledger imbalance identified.",!result.data.balanced);await h.reload();
 }));
 });
}
function journalDialog(h,j){
 h.modal("Journal entry "+j.id,'<div class="modal-body"><div class="t-info">'+escape(j.description)+' · '+date(j.postedAt)+'</div>'+
 table(["GL account","Debit","Credit"],(j.lines||[]).map(l=>'<tr><td>'+escape(l.code)+'</td><td>'+dollars(l.debitCents)+'</td><td>'+dollars(l.creditCents)+'</td></tr>'),"No journal lines.")+
 '<div class="t-account-summary">'+[["Total debits",dollars(j.totalDebitCents)],["Total credits",dollars(j.totalCreditCents)]].map(row).join("")+'</div></div><div class="modal-bottom"><button class="button secondary" data-close>Close</button></div>');
}
export function treasuryPageBind(s,h){
 if(!treasuryPages.includes(s.page))return;
 document.getElementById("treasury-account")?.addEventListener("change",ev=>{selected=ev.target.value;h.renderShell();});
 document.getElementById("t-new-payment")?.addEventListener("click",()=>paymentDialog(h));
 document.getElementById("t-refund-new")?.addEventListener("click",()=>refundRequestDialog(h));
 document.getElementById("t-plan-new")?.addEventListener("click",()=>planRequestDialog(h));
 document.getElementById("t-reconcile")?.addEventListener("click",()=>reconcileDialog(h));
 document.getElementById("t-search")?.addEventListener("change",ev=>{search=ev.target.value;h.renderShell();});
 document.querySelectorAll("[data-t-refund]").forEach(b=>b.addEventListener("click",()=>{const r=data.refunds.find(x=>x.id===b.dataset.tRefund);if(r)refundReviewDialog(h,s,r);}));
 document.querySelectorAll("[data-t-plan]").forEach(b=>b.addEventListener("click",()=>{const p=data.plans.find(x=>x.id===b.dataset.tPlan);if(p)planReviewDialog(h,s,p);}));
 document.querySelectorAll("[data-t-journal]").forEach(b=>b.addEventListener("click",()=>{const j=data.journals.find(x=>x.id===b.dataset.tJournal);if(j)journalDialog(h,j);}));
}
