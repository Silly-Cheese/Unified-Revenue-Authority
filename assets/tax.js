// Generation 2 UI: full-page tax filing wizard, examiner queues, assessments and policy control.
import {call} from "./auth.js";
import {db} from "./firebase.js";
import {collection,getDocs,query,orderBy,limit} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";

export const taxPages=["filings","processing","assessments","taxpolicy"];
const money=(n)=>"$"+(Number(n||0)/100).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
const num=(n)=>Number(n||0).toLocaleString("en-US",{maximumFractionDigits:0});
const date=(s)=>s?new Date(s).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}):"—";
const labels={draft:"Draft",submitted:"Awaiting examination",information_requested:"Information requested",rejected:"Correction required",accepted:"Accepted & assessed"};
const moneyFields={
 individual:{
  income:[["wages","Wages & salaries"],["selfEmployment","Self-employment income"],["investmentIncome","Investment & interest income"],["otherIncome","Other income"]],
  deductions:[["itemizedDeductions","Itemized deductions"],["withholding","Tax withheld"],["estimatedPayments","Estimated tax payments"],["credits","Other nonrefundable credits"]]
 },
 business:{
  income:[["grossReceipts","Gross business receipts"],["otherIncome","Other business income"],["costOfGoods","Cost of goods sold"],["payroll","Wages & payroll expense"]],
  deductions:[["operatingExpenses","Other operating expenses"],["estimatedPayments","Estimated tax payments"],["withholding","Withholding reported"],["credits","Other nonrefundable credits"]]
 }
};
let catalog=null,returns=[],assessments=[],editing=null,step=0,preview=null,searchTerm="",statusFilter="all",yearFilter="2026";
let loading=false,loadError="";
const e=(s)=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const roleStaff=(s)=>s.me?.role!=="citizen";
const commissioner=(s)=>s.me?.role==="commissioner";
const empty=(title,desc)=>'<div class="tax-empty"><div class="tax-empty-mark">URA</div><h3>'+e(title)+'</h3><p>'+e(desc)+'</p></div>';
const status=(s)=>'<span class="tax-status '+e(s)+'">'+e(labels[s]||s)+'</span>';
const metric=(name,value,foot)=>'<div class="tax-metric"><small>'+e(name)+'</small><strong>'+e(value)+'</strong><span>'+e(foot||"")+'</span></div>';
const policyOf=(year,type)=>catalog?.policies?.find(p=>p.id===String(year)+"_"+type);
const yearsSelect=(selected)=>((catalog?.years)||[2025,2026,2027,2028]).map(y=>'<option value="'+y+'" '+(Number(selected)===Number(y)?"selected":"")+'>'+y+'</option>').join("");
function labelType(type){return type==="business"?"Business income tax":"Individual income tax";}
function defaultInputs(type){
 const data={};
 for(const category of Object.values(moneyFields[type]))for(const [key] of category)data[key]="0.00";
 if(type==="individual"){data.filingStatus="single";data.dependents=0;}
 else data.businessActivity="";
 data.explanation="";data.attested=false;
 return data;
}
function accessor(h,field){return e(editing?.data?.[field]??"");}
function field(h,key,title,hint=""){
 return '<label class="tax-form-field"><span>'+e(title)+'</span><div class="tax-dollar"><b>$</b><input type="number" min="0" max="999999999.99" step="0.01" inputmode="decimal" data-money="'+e(key)+'" value="'+accessor(h,key)+'" aria-label="'+e(title)+'"></div>'+(hint?'<small>'+e(hint)+'</small>':"")+'</label>';
}
export async function taxLoad(state){
 if(!taxPages.includes(state.page))return;
 loading=true;loadError="";
 try{
  const jobs=[];
  if(state.page==="filings"||state.page==="processing"){
   jobs.push(call("listTaxReturns").then(r=>{returns=r.data.items||[];}));
  }
  if(state.page==="filings"||state.page==="taxpolicy"){
   jobs.push(call("getTaxCatalog").then(r=>{catalog=r.data;}));
  }
  if(state.page==="assessments"){
   jobs.push(call("listTaxAssessments").then(r=>{assessments=r.data.items||[];}));
  }
  if(state.page==="filings"&&roleStaff(state)){
   jobs.push(getDocs(query(collection(db,"taxpayers"),orderBy("createdAt","desc"),limit(200)))
    .then(q=>{state.taxpayers=q.docs.map(d=>({id:d.id,...d.data()}));}));
  }
  await Promise.all(jobs);
 }catch(err){loadError=err.message||"Could not load filing information.";}
 finally{loading=false;}
}
export function taxPageHTML(state,h){
 if(state.page==="filings")return editing?formHTML(state,h):filingsHTML(state,h);
 if(state.page==="processing")return processingHTML(state,h);
 if(state.page==="assessments")return assessmentsHTML(state,h);
 if(state.page==="taxpolicy"&&commissioner(state))return policiesHTML(state,h);
 return h.pageHeader("Restricted module","Your role does not allow access to this section.");
}
function filingsHTML(state,h){
 const own=roleStaff(state)?"Agency filing desk":"Your tax filings";
 const list=returns.filter(r=>{
  const q=searchTerm.toLowerCase();
  return (r.caseNumber+" "+r.taxpayerName+" "+r.taxYear).toLowerCase().includes(q)&&
   (statusFilter==="all"||r.status===statusFilter);
 });
 const draft=returns.filter(r=>r.status==="draft").length,awaiting=returns.filter(r=>r.status==="submitted").length;
 return h.pageHeader(own,"Manage detailed fictional returns, supporting income statements and filing submissions.",
  '<button class="button" id="tax-new">'+h.icon("plus")+' New tax return</button>')+
 '<div class="tax-metrics">'+metric("Total returns",returns.length,"Saved in the current workspace")+
 metric("Unsubmitted drafts",draft,"Editable in filing workspace")+
 metric("Awaiting review",awaiting,"Submitted for examination")+'</div>'+
 '<div class="card card-pad"><div class="section-head"><h2>Tax return register</h2><span class="pill gray">Generation 2 · Official RP cases</span></div>'+
 '<div class="toolbar tax-toolbar"><input id="tax-search" class="input" placeholder="Search case, taxpayer or year" value="'+e(searchTerm)+'" aria-label="Search return register">'+
 '<select id="tax-status-filter" class="input" aria-label="Filter by status">'+
 [['all','All statuses'],["draft","Draft"],["submitted","Submitted"],["information_requested","Information requested"],["rejected","Correction required"],["accepted","Accepted"]].map(([v,t])=>'<option value="'+v+'" '+(statusFilter===v?"selected":"")+'>'+t+'</option>').join("")+'</select></div>'+
 (list.length?'<div class="table-wrap"><table class="table"><thead><tr><th>Filing reference</th><th>Taxpayer</th><th>Year</th><th>Tax liability</th><th>Status</th><th></th></tr></thead><tbody>'+
 list.map(r=>'<tr><td><strong>'+e(r.caseNumber)+'</strong><div class="tax-sub">'+e(labelType(r.returnType))+'</div></td><td>'+e(r.taxpayerName||"Unknown")+'</td><td>'+e(r.taxYear)+'</td><td class="tax-mono">'+money(r.calculation?.taxDueCents)+'</td><td>'+status(r.status)+'</td><td><button class="link" data-tax-open="'+e(r.id)+'">'+(["draft","information_requested","rejected"].includes(r.status)?"Continue":"View")+'</button></td></tr>').join("")+'</tbody></table></div>':empty("No tax returns found","Start a new return to begin processing fictional tax information."))+
 '</div><div class="tax-disclaimer">Simulation notice: All tax figures, forms, people, policies, and rulings are fictional.</div>';
}
function newReturnDialog(state,h){
 const active=(state.taxpayers||[]).filter(t=>t.status==="active");
 const citizen=state.me?.role==="citizen";
 const taxpayers= citizen?'<div class="tax-info">This return will be filed under your registered taxpayer account.</div>':
  '<div class="field"><label for="tax-subject">Taxpayer record</label><select id="tax-subject" class="input" required>'+
  (active.length?active.map(t=>'<option value="'+e(t.id)+'">'+e(t.fullName)+' · '+e(t.taxpayerNumber||t.id)+'</option>').join(""):'<option value="">No taxpayers available — register one first</option>')+'</select></div>';
 h.modal("Start a tax return",'<div class="modal-body"><div class="field"><label for="tax-year">Filing year</label><select id="tax-year" class="input">'+yearsSelect(2026)+'</select></div><div class="field"><label for="tax-type">Return type</label><select id="tax-type" class="input"><option value="individual">Individual income tax</option><option value="business">Business income tax</option></select></div>'+taxpayers+'<div class="tax-info">Drafts are confidential and saved through a secured Firebase Function. A return becomes an agency case when submitted.</div></div><div class="modal-bottom"><button class="button secondary" data-close>Cancel</button><button class="button" id="begin-filing">Begin filing</button></div>',el=>{
  el.querySelector("#begin-filing").addEventListener("click",()=>{
   const year=Number(el.querySelector("#tax-year").value);
   const returnType=el.querySelector("#tax-type").value;
   const taxpayerId=citizen?state.me.taxpayerId:el.querySelector("#tax-subject").value;
   if(!taxpayerId){h.toast("Register a taxpayer before starting this form.",true);return;}
   const prev=returns.find(r=>r.taxpayerId===taxpayerId&&r.taxYear===year&&r.returnType===returnType&&!r.amendedFrom);
   if(prev){
    if(["accepted","submitted"].includes(prev.status)){h.toast("This return has already been filed. Open it to review or amend.",true);return;}
    editing={id:prev.id,taxYear:year,returnType,taxpayerId,data:{...prev.data}};
   }else editing={id:null,taxYear:year,returnType,taxpayerId,data:defaultInputs(returnType)};
   step=0;preview=null;el.remove();h.renderShell();
  });
 });
}
function formSteps(){return ["Filing identity","Income details","Deductions & credits","Review & declare"];}
function formHTML(state,h){
 const f=editing,policy=policyOf(f.taxYear,f.returnType);
 const stepNames=formSteps();
 return '<div class="tax-backline"><button class="link" id="tax-back-list">← Back to tax register</button><span>FORM URA-'+(f.returnType==="individual"?"1040":"1120")+' · '+e(f.taxYear)+'</span></div>'+
 '<div class="tax-wizard card"><div class="tax-wizard-head"><div><div class="eyebrow" style="color:#bd9b61">OFFICIAL TAX FILING · ROLEPLAY SIMULATION</div><h1>'+e(labelType(f.returnType))+'</h1><p>Tax year '+e(f.taxYear)+' · '+(f.id?"Continue a saved case":"New electronic filing")+'</p></div><div class="tax-year-mark">'+e(f.taxYear)+'</div></div>'+
 '<div class="tax-stepper">'+stepNames.map((s,i)=>'<div class="tax-step '+(i===step?"current":i<step?"complete":"")+'"><span>'+(i<step?h.icon("check"):(i+1))+'</span><small>'+e(s)+'</small></div>').join("")+'</div>'+
 '<div class="tax-form-content">'+(step===0?identityStep(state,h,policy):step===1?moneyStep(state,h,"income"):step===2?moneyStep(state,h,"deductions"):reviewStep(state,h,policy))+'</div>'+
 '<div class="tax-wizard-footer"><button class="button secondary" id="tax-save">'+h.icon("file")+' Save draft</button><div class="tax-wizard-actions">'+(step>0?'<button class="button secondary" id="tax-prev">Previous</button>':"")+
 (step<3?'<button class="button" id="tax-next">Continue '+h.icon("chevron")+'</button>':'<button class="button" id="tax-submit">'+h.icon("check")+' Sign & submit return</button>')+'</div></div></div>'+
 '<div class="tax-disclaimer">The Unified Revenue Authority is fictional. Do not enter real taxpayer identifiers or real financial information.</div>';
}
function identityStep(state,h,policy){
 const name=(state.taxpayers||[]).find(t=>t.id===editing.taxpayerId)?.fullName||state.me?.displayName||"Taxpayer";
 return '<div class="tax-section-overline">SECTION I · FILING INFORMATION</div><h2>Taxpayer & return classification</h2><p class="tax-section-desc">Verify the filing entity and applicable simulated tax rules before entering financial information.</p>'+
 '<div class="tax-detail-grid"><div><small>Taxpayer</small><strong>'+e(name)+'</strong></div><div><small>Tax year</small><strong>'+e(editing.taxYear)+'</strong></div><div><small>Return type</small><strong>'+e(labelType(editing.returnType))+'</strong></div><div><small>Policy</small><strong>Version '+e(policy?.policy?.version||1)+'</strong></div></div>'+
 (editing.returnType==="individual"?'<div class="tax-input-grid"><label class="tax-form-field"><span>Filing status</span><select class="input" data-form-field="filingStatus">'+[["single","Single"],["married","Married / Joint"],["head","Head of Household"]].map(([v,t])=>'<option value="'+v+'" '+(editing.data.filingStatus===v?"selected":"")+'>'+t+'</option>').join("")+'</select></label><label class="tax-form-field"><span>Number of eligible dependents</span><input class="input" data-form-field="dependents" type="number" min="0" max="25" step="1" value="'+e(editing.data.dependents)+'"></label></div>':
 '<label class="tax-form-field"><span>Business activity or industry (optional)</span><input class="input" data-form-field="businessActivity" maxlength="120" placeholder="e.g., Retail distribution" value="'+e(editing.data.businessActivity||"")+'"></label>')+
 '<div class="tax-info"><strong>Policy guidance:</strong> The simulation uses invented tax rates and allowances for roleplay. Submissions lock the applicable policy version for the tax year.</div>';
}
function moneyStep(state,h,category){
 const isIncome=category==="income";
 const heading=isIncome?"Income & revenue statements":"Deductions, credits & payments";
 const sub=isIncome?"Record the fictional income and earnings that apply to this return.":"Declare allowable fictional expenses, credits, withholding, and estimated payments.";
 const fields=moneyFields[editing.returnType][category];
 return '<div class="tax-section-overline">SECTION '+(isIncome?"II":"III")+' · '+(isIncome?"FINANCIAL DECLARATIONS":"TAX ADJUSTMENTS")+'</div><h2>'+heading+'</h2><p class="tax-section-desc">'+sub+'</p><div class="tax-input-grid">'+fields.map(([k,t])=>field(h,k,t)).join("")+'</div>'+
 '<label class="tax-form-field" style="margin-top:20px"><span>Supporting explanation (optional)</span><textarea class="input" data-form-field="explanation" rows="4" maxlength="1000" placeholder="Describe unusual fictional tax circumstances or source records.">'+e(editing.data.explanation||"")+'</textarea></label>'+
 '<div class="tax-info">Financial fields represent fictional amounts in USD. All assessments will be recalculated securely by the agency server before submission.</div>';
}
function reviewStep(state,h,policy){
 return '<div class="tax-section-overline">SECTION IV · FINAL REVIEW</div><h2>Calculation & declaration</h2><p class="tax-section-desc">Review your figures before submitting a return to the examination queue.</p>'+
 (!preview?'<div class="tax-info">Click <strong>Calculate return</strong> to verify all amounts under the fictional tax policy.</div><button class="button secondary" id="tax-calculate">Calculate return</button>':
 '<div class="tax-results">'+
 [['Reported gross income',preview.calculation.grossIncomeCents],
 ["Allowable deductions",preview.calculation.deductionsCents],
 ["Taxable income",preview.calculation.taxableIncomeCents],
 ["Tax before credits",preview.calculation.baseTaxCents],
 ["Credits applied",preview.calculation.appliedCreditsCents],
 ["Total tax liability",preview.calculation.taxDueCents],
 ["Tax payments & withholding",preview.calculation.paymentsCents]].map(([n,v])=>'<div class="tax-results-row"><span>'+e(n)+'</span><strong>'+money(v)+'</strong></div>').join("")+
 '<div class="tax-results-total"><div><small>Calculated refund claim</small><strong>'+money(preview.calculation.refundCents)+'</strong></div><div><small>Balance due</small><strong>'+money(preview.calculation.balanceCents)+'</strong></div></div>'+
 (preview.calculation.reviewFlags.length?'<div class="tax-review-alert"><strong>Examiner review flags</strong>'+preview.calculation.reviewFlags.map(x=>'<p>• '+e(x)+'</p>').join("")+'</div>':"")+'</div><button class="link" id="tax-calculate" style="margin-top:12px">Recalculate values</button>')+
 '<label class="tax-attest"><input id="tax-attest" type="checkbox" '+(editing.data.attested?"checked":"")+'> <span>I declare these fictional financial entries to be accurate within the roleplay scenario and understand submission creates an official simulation case.</span></label>'+
 '<p class="tax-sub">Submission does not charge money or create an actual tax liability. Accepted returns create simulated assessments only.</p>';
}
function filteredQueue(){
 return returns.filter(r=>r.status==="submitted"&&
 (r.caseNumber+" "+r.taxpayerName+" "+r.taxYear).toLowerCase().includes(searchTerm.toLowerCase()));
}
function processingHTML(state,h){
 if(!roleStaff(state))return h.pageHeader("Access restricted","The examination division is available only to agency personnel.");
 const list=filteredQueue(),all=returns.filter(r=>r.status==="submitted");
 return h.pageHeader("Return processing center","Examiner workbench for submitted filings, discrepancy review, and formal determinations.")+
 '<div class="tax-metrics">'+metric("Awaiting determination",all.length,"Submitted returns requiring action")+
 metric("Review flags",all.filter(r=>r.calculation?.reviewFlags?.length).length,"Cases with automated indicators")+
 metric("Accepted returns",returns.filter(r=>r.status==="accepted").length,"Cases formally assessed")+'</div>'+
 '<div class="card card-pad"><div class="section-head"><h2>Examination docket</h2><span class="pill gold">Pending decisions</span></div><div class="toolbar"><input class="input" id="tax-queue-search" placeholder="Find by taxpayer or filing reference" value="'+e(searchTerm)+'"></div>'+
 (list.length?'<div class="table-wrap"><table class="table"><thead><tr><th>Return reference</th><th>Taxpayer</th><th>Tax year</th><th>Claimed refund</th><th>Review indicators</th><th></th></tr></thead><tbody>'+
 list.map(r=>'<tr><td><strong>'+e(r.caseNumber)+'</strong><div class="tax-sub">'+e(labelType(r.returnType))+'</div></td><td>'+e(r.taxpayerName)+'</td><td>'+e(r.taxYear)+'</td><td>'+money(r.calculation?.refundCents)+'</td><td>'+(r.calculation?.reviewFlags?.length?'<span class="tax-status information_requested">'+r.calculation.reviewFlags.length+' flagged</span>':'<span class="pill">Standard</span>')+'</td><td><button class="link" data-tax-review="'+e(r.id)+'">Examine</button></td></tr>').join("")+'</tbody></table></div>':empty("Processing queue clear","Newly submitted fictional returns will appear here for review."))+
 '</div><div class="tax-disclaimer">Return acceptance creates an assessment record, not a cash transfer or collection entry.</div>';
}
function assessmentsHTML(state,h){
 const list=assessments.filter(a=>(a.caseNumber+" "+a.taxpayerName+" "+a.taxYear).toLowerCase().includes(searchTerm.toLowerCase()));
 return h.pageHeader("Tax assessment register","Formal decisions and assessed fictional liabilities created by approved returns.")+
 '<div class="tax-metrics">'+metric("Assessments issued",assessments.length,"Approved return records")+
 metric("Total assessed tax",money(assessments.reduce((n,a)=>n+a.taxDueCents,0)),"Gross assessed (not collected)")+
 metric("Refund claims",money(assessments.reduce((n,a)=>n+a.refundClaimCents,0)),"Not yet disbursed")+'</div>'+
 '<div class="card card-pad"><div class="section-head"><h2>Assessment notices</h2><span class="pill gray">No Treasury posting · Gen 3</span></div><div class="toolbar"><input class="input" id="tax-assess-search" placeholder="Search assessment records" value="'+e(searchTerm)+'"></div>'+
 (list.length?'<div class="table-wrap"><table class="table"><thead><tr><th>Assessment reference</th><th>Taxpayer</th><th>Period</th><th>Tax due</th><th>Adjustment</th><th>Balance / refund</th></tr></thead><tbody>'+
 list.map(a=>'<tr><td><strong>'+e(a.caseNumber)+'</strong><div class="tax-sub">'+e(a.adjustmentKind)+'</div></td><td>'+e(a.taxpayerName)+'</td><td>'+e(a.taxYear)+'</td><td class="tax-mono">'+money(a.taxDueCents)+'</td><td class="tax-mono">'+(a.deltaTaxCents<0?"−":"+")+money(Math.abs(a.deltaTaxCents))+'</td><td>'+money(a.balanceCents)+' / '+money(a.refundClaimCents)+'</td></tr>').join("")+'</tbody></table></div>':empty("No assessments issued","An examiner must accept a submitted return before an assessment is recorded."))+
 '</div>';
}
function policiesHTML(state,h){
 const list=(catalog?.policies||[]).filter(x=>String(x.policy.year)===yearFilter);
 return h.pageHeader("Tax policy administration","Configure tax rates, deductions, credits, and bracket schedules for fictional tax years.")+
 '<div class="tax-info" style="margin-bottom:20px"><strong>Year locking:</strong> The first submitted filing locks its tax policy for that return type and year. Older cases retain their exact policy snapshot; already-submitted rules cannot be silently rewritten.</div>'+
 '<div class="card card-pad"><div class="section-head"><h2>Fiscal-year policy schedules</h2><select id="tax-policy-year" class="input" style="width:140px">'+yearsSelect(yearFilter)+'</select></div><div class="tax-policy-grid">'+list.map(row=>{
 const p=row.policy;
 return '<div class="tax-policy-card"><div class="tax-policy-top"><div><div class="tax-section-overline">'+e(p.type.toUpperCase())+' / '+e(p.year)+'</div><h3>'+e(p.title)+'</h3></div>'+status(row.locked?"accepted":"draft")+'</div>'+
 '<div class="tax-policy-meta">'+(p.type==="individual"?
 '<div><small>Standard deduction</small><strong>'+money(p.standardDeductionCents)+'</strong></div><div><small>Dependent credit</small><strong>'+money(p.dependentCreditCents)+'</strong></div><div><small>Marginal brackets</small><strong>'+p.brackets.length+'</strong></div>':
 '<div><small>Business rate</small><strong>'+(p.corporateRateBps/100).toFixed(2)+'%</strong></div><div><small>Allowance</small><strong>'+money(p.businessAllowanceCents)+'</strong></div>')+
 '</div><div class="tax-policy-foot"><span>Version '+e(p.version)+(row.customized?" · Custom":" · Agency default")+'</span><button class="button secondary" data-policy-edit="'+e(row.id)+'" '+(row.locked?"disabled":"")+'>'+(row.locked?"Locked":"Edit schedule")+'</button></div></div>';
 }).join("")+'</div></div>';
}
function viewReturn(r,state,h,examine=false){
 let info='<div class="modal-body"><div class="tax-detail-grid">'+
 [["Taxpayer",r.taxpayerName],["Filing reference",r.caseNumber],["Tax year",r.taxYear],["Return type",labelType(r.returnType)],
 ["Processing status",labels[r.status]||r.status],["Submitted",date(r.submittedAt)]].map(([a,b])=>'<div><small>'+e(a)+'</small><strong>'+e(b)+'</strong></div>').join("")+'</div>'+
 '<div class="tax-results" style="margin-top:20px">'+[
 ["Gross income",r.calculation?.grossIncomeCents],
 ["Taxable income",r.calculation?.taxableIncomeCents],
 ["Tax liability",r.calculation?.taxDueCents],
 ["Payments and withholding",r.calculation?.paymentsCents],
 ["Refund claimed",r.calculation?.refundCents],
 ["Balance due",r.calculation?.balanceCents]].map(([a,b])=>'<div class="tax-results-row"><span>'+e(a)+'</span><strong>'+money(b)+'</strong></div>').join("")+'</div>'+
 (r.calculation?.reviewFlags?.length?'<div class="tax-review-alert"><strong>Automated examination indicators</strong>'+r.calculation.reviewFlags.map(t=>'<p>• '+e(t)+'</p>').join("")+'</div>':"")+
 (r.decisionReason?'<div class="tax-info" style="margin-top:18px"><strong>Decision or correspondence:</strong> '+e(r.decisionReason)+'</div>':"")+
 '<div class="tax-sub" style="margin-top:18px">All amounts are fictional. This filing is not a real tax or government document.</div></div><div class="modal-bottom">';
 const editable=["draft","information_requested","rejected"].includes(r.status);
 if(editable)info+='<button class="button" id="tax-edit-return">Edit return</button>';
 else if(r.status==="accepted"&&!r.amendedFrom)info+='<button class="button secondary" id="tax-amend-return">Start amendment</button>';
 if(examine&&r.status==="submitted"&&roleStaff(state))info+='<button class="button" id="tax-decide-return">Issue determination</button>';
 info+='<button class="button secondary" data-close>Close</button></div>';
 h.modal("Return examination · "+r.caseNumber,info,el=>{
  el.querySelector("#tax-edit-return")?.addEventListener("click",()=>{
   editing={id:r.id,returnType:r.returnType,taxYear:r.taxYear,taxpayerId:r.taxpayerId,data:{...r.data}};
   step=0;preview=null;el.remove();location.hash="filings";h.renderShell();
  });
  el.querySelector("#tax-amend-return")?.addEventListener("click",async()=>{
   try{
    const response=await call("beginTaxAmendment",{returnId:r.id});
    editing={id:response.data.returnId,returnType:r.returnType,taxYear:r.taxYear,taxpayerId:r.taxpayerId,data:{...r.data,attested:false}};
    step=0;preview=null;el.remove();location.hash="filings";h.renderShell();
   }catch(err){h.toast(err.message,true);}
  });
  el.querySelector("#tax-decide-return")?.addEventListener("click",()=>{el.remove();decisionModal(r,h);});
 });
}
function decisionModal(r,h){
 const canAccept=r.ownerUid!==h.state.user?.uid;
 h.modal("Examiner determination",'<div class="modal-body"><div class="tax-info"><strong>Return:</strong> '+e(r.caseNumber)+' · '+e(r.taxpayerName)+'</div>'+
 '<div class="field" style="margin-top:18px"><label>Proposed disposition</label><select id="tax-decision" class="input">'+
 '<option value="accept" '+(!canAccept?"disabled":"")+'>Accept and record assessment</option>'+
 '<option value="request_information">Request additional information</option>'+
 '<option value="reject">Reject and return for correction</option></select></div>'+
 '<div class="field"><label>Examiner findings and decision rationale (required)</label><textarea id="tax-decision-reason" class="input" rows="5" maxlength="1500" placeholder="Document evidence reviewed, basis for determination, and requested corrective actions."></textarea></div>'+
 (canAccept?"":'<div class="error">You cannot accept your own personal taxpayer filing. Assign another examiner.</div>')+
 '<div class="tax-info">Accepted returns generate a formal assessment record. Refund payment and collections will follow in Generation 3.</div></div>'+
 '<div class="modal-bottom"><button class="button secondary" data-close>Cancel</button><button class="button" id="tax-issue-decision">Record determination</button></div>',el=>{
 const select=el.querySelector("#tax-decision");if(!canAccept)select.value="request_information";
 el.querySelector("#tax-issue-decision").addEventListener("click",async()=>{
  const button=el.querySelector("#tax-issue-decision"),reason=el.querySelector("#tax-decision-reason").value;
  if(reason.trim().length<12){h.toast("Write a meaningful examiner decision reason.",true);return;}
  button.disabled=true;
  try{
   await call("reviewTaxReturn",{returnId:r.id,action:select.value,reason});
   h.toast("Examiner determination recorded.");el.remove();await h.reload();
  }catch(err){h.toast(err.message,true);}finally{button.disabled=false;}
 });
 });
}
function editPolicyDialog(row,h){
 const p=structuredClone(row.policy);
 const extra=p.type==="individual"?
 '<div class="tax-input-grid"><label class="tax-form-field"><span>Standard deduction ($)</span><input class="input" id="tax-deduction" type="number" min="0" step=".01" value="'+(p.standardDeductionCents/100)+'"></label>'+
 '<label class="tax-form-field"><span>Dependent credit ($)</span><input class="input" id="tax-dependent" type="number" min="0" step=".01" value="'+(p.dependentCreditCents/100)+'"></label></div>'+
 '<h3 style="font-size:14px;margin:20px 0 10px">Marginal income tax brackets</h3><p class="tax-sub" style="margin-bottom:10px">Set upper taxable income thresholds and marginal percentage rates. The last bracket has no upper limit.</p>'+
 p.brackets.map((b,i)=>'<div class="tax-policy-bracket"><span>Bracket '+(i+1)+'</span><label>Upper threshold ($)<input class="input" type="number" min="0" step=".01" data-limit="'+i+'" value="'+(b.upToCents===null?"":b.upToCents/100)+'" '+(b.upToCents===null?"disabled placeholder='No limit'":"")+'></label>'+
 '<label>Rate (%)<input class="input" type="number" min="0" max="100" step=".01" data-rate="'+i+'" value="'+(b.rateBps/100)+'"></label></div>').join("")+
 '<button class="link" id="tax-add-bracket">Add bracket</button> <button class="link" id="tax-remove-bracket" style="margin-left:10px">Remove bracket</button>':
 '<div class="tax-input-grid"><label class="tax-form-field"><span>Corporate income tax rate (%)</span><input id="tax-business-rate" class="input" type="number" min="0" max="100" step=".01" value="'+(p.corporateRateBps/100)+'"></label>'+
 '<label class="tax-form-field"><span>Small-business allowance ($)</span><input id="tax-allowance" class="input" type="number" min="0" step=".01" value="'+(p.businessAllowanceCents/100)+'"></label></div>';
 h.modal("Configure fictional tax schedule",'<div class="modal-body"><div class="tax-info" style="margin-bottom:17px"><strong>'+e(p.year)+' · '+e(labelType(p.type))+'</strong><br>All rules are made-up for simulation and will lock after the first return is filed.</div>'+
 '<div class="field"><label>Policy title</label><input id="tax-policy-title" class="input" maxlength="110" value="'+e(p.title)+'"></div>'+extra+'</div>'+
 '<div class="modal-bottom"><button class="button secondary" data-close>Cancel</button><button class="button" id="tax-save-policy">Save tax policy</button></div>',el=>{
  function readBrackets(){
   return [...el.querySelectorAll("[data-rate]")].map((node,i)=>({
    rateBps:Math.round(Number(node.value)*100),
    upToCents:i===[...el.querySelectorAll("[data-rate]")].length-1?null:Math.round(Number(el.querySelector('[data-limit="'+i+'"]').value)*100)
   }));
  }
  function rebuildBrackets(){
   const rates=readBrackets();
   const current=el.querySelectorAll(".tax-policy-bracket");
   current.forEach(node=>node.remove());
   const add=el.querySelector("#tax-add-bracket");
   add.insertAdjacentHTML("beforebegin",rates.map((b,i)=>'<div class="tax-policy-bracket"><span>Bracket '+(i+1)+'</span><label>Upper threshold ($)<input class="input" type="number" min="0" step=".01" data-limit="'+i+'" value="'+(b.upToCents===null?"":b.upToCents/100)+'" '+(i===rates.length-1?"disabled placeholder='No limit'":"")+'></label><label>Rate (%)<input class="input" type="number" min="0" max="100" step=".01" data-rate="'+i+'" value="'+(b.rateBps/100)+'"></label></div>').join(""));
  }
  el.querySelector("#tax-add-bracket")?.addEventListener("click",()=>{
   const rows=readBrackets();if(rows.length>=7){h.toast("Maximum seven brackets.",true);return;}
   const last=rows.pop();const prior=rows.at(-1)?.upToCents||0;
   rows.push({upToCents:prior+1000000,rateBps:last.rateBps});
   rows.push(last);
   const nodes=el.querySelectorAll(".tax-policy-bracket");nodes.forEach(x=>x.remove());
   const anchor=el.querySelector("#tax-add-bracket");
   anchor.insertAdjacentHTML("beforebegin",rows.map((b,i)=>'<div class="tax-policy-bracket"><span>Bracket '+(i+1)+'</span><label>Upper threshold ($)<input class="input" type="number" min="0" step=".01" data-limit="'+i+'" value="'+(b.upToCents===null?"":b.upToCents/100)+'" '+(i===rows.length-1?"disabled":"")+'></label><label>Rate (%)<input class="input" type="number" min="0" max="100" step=".01" data-rate="'+i+'" value="'+(b.rateBps/100)+'"></label></div>').join(""));
  });
  el.querySelector("#tax-remove-bracket")?.addEventListener("click",()=>{
   const rows=readBrackets();if(rows.length<=2){h.toast("At least two brackets are required.",true);return;}
   rows.splice(rows.length-2,1);
   el.querySelectorAll(".tax-policy-bracket").forEach(x=>x.remove());
   el.querySelector("#tax-add-bracket").insertAdjacentHTML("beforebegin",rows.map((b,i)=>'<div class="tax-policy-bracket"><span>Bracket '+(i+1)+'</span><label>Upper threshold ($)<input class="input" type="number" min="0" step=".01" data-limit="'+i+'" value="'+(b.upToCents===null?"":b.upToCents/100)+'" '+(i===rows.length-1?"disabled":"")+'></label><label>Rate (%)<input class="input" type="number" min="0" max="100" step=".01" data-rate="'+i+'" value="'+(b.rateBps/100)+'"></label></div>').join(""));
  });
  el.querySelector("#tax-save-policy").addEventListener("click",async()=>{
   const btn=el.querySelector("#tax-save-policy");
   p.title=el.querySelector("#tax-policy-title").value;
   if(p.type==="individual"){
    p.standardDeductionCents=Math.round(Number(el.querySelector("#tax-deduction").value)*100);
    p.dependentCreditCents=Math.round(Number(el.querySelector("#tax-dependent").value)*100);
    p.brackets=readBrackets();
   }else{
    p.corporateRateBps=Math.round(Number(el.querySelector("#tax-business-rate").value)*100);
    p.businessAllowanceCents=Math.round(Number(el.querySelector("#tax-allowance").value)*100);
   }
   btn.disabled=true;
   try{await call("setTaxPolicy",{policy:p});el.remove();h.toast("Policy published for future submissions.");await h.reload();}
   catch(err){h.toast(err.message,true);}finally{btn.disabled=false;}
  });
 });
}
export function taxPageBind(state,h){
 if(!taxPages.includes(state.page))return;
 h.state=state;
 document.getElementById("tax-new")?.addEventListener("click",()=>newReturnDialog(state,h));
 document.getElementById("tax-search")?.addEventListener("input",ev=>{searchTerm=ev.target.value;const focus=ev.target.selectionStart;h.renderShell();const field=document.getElementById("tax-search");field?.focus();field?.setSelectionRange(focus,focus);});
 document.getElementById("tax-status-filter")?.addEventListener("change",ev=>{statusFilter=ev.target.value;h.renderShell();});
 document.getElementById("tax-queue-search")?.addEventListener("change",ev=>{searchTerm=ev.target.value;h.renderShell();});
 document.getElementById("tax-assess-search")?.addEventListener("change",ev=>{searchTerm=ev.target.value;h.renderShell();});
 document.getElementById("tax-policy-year")?.addEventListener("change",ev=>{yearFilter=ev.target.value;h.renderShell();});
 document.querySelectorAll("[data-tax-open]").forEach(el=>el.addEventListener("click",()=>{const r=returns.find(x=>x.id===el.dataset.taxOpen);if(r)viewReturn(r,state,h);}));
 document.querySelectorAll("[data-tax-review]").forEach(el=>el.addEventListener("click",()=>{const r=returns.find(x=>x.id===el.dataset.taxReview);if(r)viewReturn(r,state,h,true);}));
 document.querySelectorAll("[data-policy-edit]").forEach(el=>el.addEventListener("click",()=>{const item=catalog?.policies?.find(x=>x.id===el.dataset.policyEdit);if(item&&!item.locked)editPolicyDialog(item,h);}));
 if(!editing||state.page!=="filings")return;
 document.querySelectorAll("[data-money]").forEach(el=>el.addEventListener("input",()=>{editing.data[el.dataset.money]=el.value;preview=null;}));
 document.querySelectorAll("[data-form-field]").forEach(el=>el.addEventListener("input",()=>{editing.data[el.dataset.formField]=el.type==="number"?Number(el.value):el.value;preview=null;}));
 document.getElementById("tax-attest")?.addEventListener("change",ev=>{editing.data.attested=ev.target.checked;});
 document.getElementById("tax-back-list")?.addEventListener("click",()=>{editing=null;preview=null;h.reload();});
 document.getElementById("tax-prev")?.addEventListener("click",()=>{step=Math.max(0,step-1);h.renderShell();});
 document.getElementById("tax-next")?.addEventListener("click",async()=>{step=Math.min(3,step+1);h.renderShell();if(step===3)await calculatePreview(h);});
 document.getElementById("tax-calculate")?.addEventListener("click",()=>calculatePreview(h));
 document.getElementById("tax-save")?.addEventListener("click",()=>saveDraft(h));
 document.getElementById("tax-submit")?.addEventListener("click",()=>submitDraft(h));
}
function body(){return {returnId:editing?.id||undefined,taxpayerId:editing.taxpayerId,taxYear:editing.taxYear,returnType:editing.returnType,data:editing.data};}
async function calculatePreview(h){
 if(!editing)return;
 try{const r=await call("previewTaxReturn",body());preview=r.data;h.renderShell();}
 catch(err){h.toast(err.message,true);}
}
async function saveDraft(h,quiet=false){
 try{
  const saved=await call("saveTaxDraft",body());
  editing.id=saved.data.returnId;
  if(!quiet)h.toast("Fictional return draft saved securely.");
  return true;
 }catch(err){h.toast(err.message,true);return false;}
}
async function submitDraft(h){
 if(!editing.data.attested){h.toast("Complete the simulation declaration before submitting.",true);return;}
 if(!preview){const r=await call("previewTaxReturn",body()).catch(err=>{h.toast(err.message,true);return null;});if(!r)return;preview=r.data;}
 if(!(await saveDraft(h,true)))return;
 try{
  await call("submitTaxReturn",{returnId:editing.id});
  editing=null;preview=null;step=0;h.toast("Tax return formally submitted for examination.");await h.reload();
 }catch(err){h.toast(err.message,true);}
}
export function resetTaxView(){editing=null;preview=null;step=0;searchTerm="";statusFilter="all";}
