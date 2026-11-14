// Generation 6 — Institutional Intelligence, Registry Search and Document Studio.
import {selectOperationsTaxpayer} from "./operations.js";
import {call} from "./auth.js";
import {isFiledReturn,openReturnDetails,printFullFiling} from "./tax.js";
import {openPortalActivation,openPortalReset,portalStatus} from "./portal.js";
import {escapeHTML as E,centsText as cash,csvText,createCSV,printDocument} from "./documents.js";

export const enterprisePages=["executive","registry","dossier","documents"];
const canStaff=s=>s.me?.role&&s.me.role!=="citizen";
const executive=s=>["commissioner","supervisor"].includes(s.me?.role);
let year=2026,report=null,issued=[],registry=[],registryNext=null,registryPrefix="",registryCursor=null;
let registryStack=[],selectedTaxpayerId="",dossier=null,dossierViewer="",recordKind="statement",recordId="";
const statuses={
 accepted:"Accepted",submitted:"Pending examiner review",draft:"Saved draft",
 information_requested:"Information requested",rejected:"Correction requested"
};
const toDate=v=>{if(!v)return"—";const d=new Date(v);return Number.isFinite(d.getTime())?d.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}):"—";};
const number=n=>Number(n||0).toLocaleString("en-US");
const pill=(text,kind="neutral")=>'<span class="e-pill e-'+E(kind)+'">'+E(text)+'</span>';
const empty=(heading,desc)=>'<div class="e-empty"><div class="e-empty-mark">URA</div><strong>'+E(heading)+'</strong><p>'+E(desc)+'</p></div>';
const ledger=(name,value,desc)=>'<div class="e-kpi"><small>'+E(name)+'</small><strong>'+E(value)+'</strong><span>'+E(desc||"")+'</span></div>';
const title=(s,h,heading,desc,action)=>h.pageHeader(heading,desc,action||"");
const row=(k,v)=>'<div class="e-detail-row"><span>'+E(k)+'</span><strong>'+E(v)+'</strong></div>';
const tbl=(headers,rows,none)=>rows.length?'<div class="table-wrap"><table class="table"><thead><tr>'+headers.map(h=>'<th>'+E(h)+'</th>').join("")+'</tr></thead><tbody>'+rows.join("")+'</tbody></table></div>':empty("Nothing recorded",none);
function heading(text,meta=""){return '<div class="e-section-heading"><h2>'+E(text)+'</h2>'+(meta?'<span>'+E(meta)+'</span>':"")+'</div>';}
function covered(caption,field){
 const covered=report?.coverage?.[field];
 return covered?.complete?caption:caption+" · sampled "+(covered?.sampled??0)+"/"+(covered?.total??0);
}
function reportKPIs(r){
 const c=r.coverage?.accounts;
 return '<div class="e-metrics">'+
 ledger("Tax accounts",number(r.totals?.fiscalAccounts),"Fiscal "+r.taxYear+" records")+
 ledger("Assessed liability",cash(r.financial?.assessedCents),(c?.complete?"Complete":"Partial account sample"))+
 ledger("Outstanding tax",cash(r.financial?.outstandingCents),"Simulated tax receivables")+
 ledger("Fictional payments",cash(r.financial?.directPaymentsCents),"Payments posted to accounts")+'</div>'+
 '<div class="e-metrics e-secondary-metrics">'+
 ledger("Returns filed",number(r.totals?.fiscalFilings),"All fiscal-year return records")+
 ledger("Active case files",number(r.totals?.fiscalCases),"All registered fiscal-year cases")+
 ledger("Refund credits",cash(r.financial?.creditAvailableCents),"Available (not reserved)")+
 ledger("Posted ledger entries",number(r.ledger?.postedJournals),"All years · accounting control")+'</div>';
}
function coverageRows(r){
 const labels={accounts:"Tax accounts",filings:"Tax returns",cases:"Agency cases",receipts:"Treasury receipts"};
 return Object.entries(labels).map(([key,label])=>{
  const x=r.coverage?.[key];
  return '<div class="e-coverage-row"><strong>'+E(label)+'</strong><span>'+number(x?.sampled)+' / '+number(x?.total)+'</span>'+
   (x?.complete?pill("Complete","good"):pill("Sampled only","caution"))+'</div>';
 }).join("");
}
function receiptGraph(r){
 const data=r.trend||[],max=Math.max(1,...data.map(x=>Number(x.receiptCents)||0));
 return '<div class="e-chart"><div class="e-chart-legend">SIMULATED RECEIPTS · '+E(r.taxYear)+' · '+E(covered("FISCAL TREND","receipts"))+'</div>'+
 '<div class="e-bars">'+data.map(item=>'<div class="e-bar-group"><div class="e-bar" title="'+E(item.label)+": "+E(cash(item.receiptCents))+'" style="height:'+Math.max(3,Math.round(Number(item.receiptCents||0)/max*100))+'%"></div><small>'+E(item.label)+'</small></div>').join("")+'</div></div>';
}
function execPage(s,h){
 if(!canStaff(s))return title(s,h,"Restricted reporting","Agency staff access is required.");
 return title(s,h,"Executive intelligence","Live institutional reporting, fiscal operations, issued memoranda and financial reconciliation.")+
 '<section class="e-hero"><div><div class="e-overline">OFFICE OF THE COMMISSIONER · FINANCIAL INTELLIGENCE</div><h2>Every decision, accounted for.</h2><p>Fictional operating statistics linked to your Treasury, filings and agency casework. No invented totals or hidden extrapolations.</p></div><div class="e-gold-seal">URA<span>REVENUE INTELLIGENCE</span></div></section>'+
 '<div class="e-yearbar"><div><strong>Fiscal intelligence</strong><span>Configure the reporting period</span></div><select class="input" id="e-year" aria-label="Reporting year">'+Array.from({length:11},(_,i)=>2025+i).map(x=>'<option value="'+x+'" '+(x===year?"selected":"")+'>'+x+'</option>').join("")+'</select>'+
 '<button class="button secondary" id="e-refresh">Refresh report</button><button class="button secondary" id="e-export">Export CSV</button><button class="button" id="e-print-preview">Print report</button></div>'+
 (!report?empty("No fiscal report loaded","Select a fiscal year and refresh to request the agency report."):
 reportKPIs(report)+
 '<div class="e-dual"><section class="card e-card">'+heading("Simulated receipt activity","12-month view")+
 receiptGraph(report)+'</section><section class="card e-card">'+heading("Accounting integrity","All fiscal years")+
 '<div class="e-ledger-status">'+pill(report.ledger?.balanced?"Debits & credits balanced":"Imbalance detected",report.ledger?.balanced?"good":"danger")+'</div>'+
 '<div class="e-stat-list">'+
 row("Journal debits",cash(report.ledger?.totalDebitsCents))+
 row("Journal credits",cash(report.ledger?.totalCreditsCents))+
 row("Chart net balance",cash(Math.abs(report.ledger?.chartNetCents)))+
 row("Recorded journal entries",number(report.ledger?.postedJournals))+'</div>'+
 '<div class="e-report-note">Accounting controls cover all posted simulated journals. Taxpayer totals can be sampled when the underlying register exceeds the reporting limit.</div></section></div>'+
 '<div class="e-dual"><section class="card e-card">'+heading("Fiscal filing workflow",covered("Return status","filings"))+
 '<div class="e-stat-list">'+Object.entries(report.workflow?.filings||{}).map(([key,value])=>row(statuses[key]||key,number(value))).join("")+'</div></section>'+
 '<section class="card e-card">'+heading("Administrative casework",covered("Case types","cases"))+
 '<div class="e-stat-list">'+Object.entries(report.workflow?.caseTypes||{}).map(([key,value])=>row(key.replace(/\b\w/g,m=>m.toUpperCase()),number(value))).join("")+'</div></section></div>'+
 '<section class="card e-card">'+heading("Data coverage","No hidden estimates")+
 '<p class="e-subheading">Fiscal-year counts come from full database count queries. Financial totals, status breakdowns and trend figures reflect the sampled records shown below.</p>'+
 '<div class="e-coverage">'+coverageRows(report)+'</div></section>')+
 (executive(s)?'<section class="card e-card" style="margin-top:18px">'+heading("Issue an executive memorandum","Creates an immutable snapshot of this fiscal report")+
 '<form id="e-issue-form"><div class="field"><label for="e-report-title">Official RP report title</label><input id="e-report-title" class="input" required maxlength="110" minlength="8" value="Fiscal '+year+' — Revenue Administration Review"></div>'+
 '<div class="field"><label for="e-report-findings">Executive findings and observations</label><textarea id="e-report-findings" class="input" rows="5" minlength="30" maxlength="3000" placeholder="Summarize the simulated financial position, operating performance, risks and administrative recommendations." required></textarea></div>'+
 '<button class="button" type="submit">Issue signed simulation memorandum</button></form></section>':"")+
 '<section class="card e-card" style="margin-top:18px">'+heading("Issued reporting memoranda","Permanent historical snapshots")+
 (issued.length?tbl(["Reference","Memorandum","Fiscal year","Issued by","Date",""],
 issued.map(item=>'<tr><td class="e-mono">'+E(item.reference)+'</td><td><strong>'+E(item.title)+'</strong></td><td>'+E(item.taxYear)+'</td><td>'+E(item.issuedByName)+'</td><td>'+toDate(item.issuedAt)+'</td><td><button class="link" data-e-issued="'+E(item.id)+'">View & print</button></td></tr>'),""):
 empty("No memoranda yet","Issue the first executive fiscal memorandum above."))+
 '</section><p class="tax-disclaimer">Fictional revenue analysis only; never use as a real government, accounting or tax statement.</p>';
}
function registryPage(s,h){
 if(!canStaff(s))return title(s,h,"Restricted registry","Personnel access is required.");
 const rows=registry.map(x=>'<tr><td><strong>'+E(x.fullName)+'</strong><div class="tax-sub">'+E(x.taxpayerNumber)+'</div></td>'+
 '<td>'+E(x.type)+'</td><td>'+E(x.region||"—")+'</td><td>'+pill(x.status,x.status==="active"?"good":"neutral")+'</td>'+
 '<td>'+pill(x.simulated?"Generated NPC":x.portalName?"Agency record":x.ownerLinked?"Registered player":"Agency record",x.simulated?"gold":"neutral")+'</td>'+
 '<td>'+pill(portalStatus(x),x.ownerLinked?"good":"neutral")+(x.portalName?'<div class="tax-sub">'+E(x.portalName)+'</div>':"")+'</td>'+
 '<td><button class="link" data-e-dossier="'+E(x.id)+'">Open dossier</button>'+
 (s.me?.role==="commissioner"&&portalStatus(x)==="Ready to convert"?'<button class="link" data-e-activate="'+E(x.id)+'">Create portal</button>':"")+'</td></tr>');
 return title(s,h,"Enterprise taxpayer registry","Search taxpayer names, browse in pages, and open comprehensive financial and casework profiles.")+
 '<div class="e-hero compact"><div><div class="e-overline">CITIZEN SERVICES · INSTITUTIONAL REGISTRY</div><h2>Every taxpayer has a story.</h2><p>One account dossier for all filings, assessments, payments, refunds and official RP correspondence.</p></div></div>'+
 '<section class="card e-card"><form id="e-registry-search" class="e-registry-search"><div><label for="e-prefix">Search by beginning of taxpayer name (case-sensitive)</label><input class="input" id="e-prefix" maxlength="60" placeholder="e.g., Jordan" value="'+E(registryPrefix)+'"></div><button class="button" type="submit">Search registry</button><button class="button secondary" type="button" id="e-clear-search">Clear</button></form>'+
 '<div class="e-coverage-row" style="margin-bottom:10px"><strong>Alphabetical taxpayer directory</strong><span>Up to 30 records per page · '+(registryStack.length+1===1?"Page 1":"Page "+(registryStack.length+1))+'</span></div>'+
 tbl(["Taxpayer","Type","Region","Status","Record origin","Portal access",""],rows,"No records match this name prefix on the selected page.")+
 '<div class="e-pagination"><button class="button secondary" id="e-prev-page" '+(!registryStack.length?"disabled":"")+'>Previous page</button><button class="button secondary" id="e-next-page" '+(!registryNext?"disabled":"")+'>Next page</button></div></section>';
}
function dossierPage(s,h){
 if(!dossier)return title(s,h,"Taxpayer dossier","An integrated account record across every URA department.")+
 empty("No taxpayer selected",canStaff(s)?"Open the enterprise taxpayer registry and select an account.":"Your account dossier is not yet available.");
 const x=dossier.taxpayer,t=dossier.totals||{},r=dossier.records||{};
 const partial=dossier.limits?.partial||[];
 const tabs=[["taxReturns","Filed tax returns"],["taxAssessments","Formal assessments"],["treasuryAccounts","Treasury accounts"],
 ["treasuryReceipts","Payment receipts"],["treasuryRefunds","Refund requests"],["treasuryPlans","Payment arrangements"],["agencyCases","Agency cases"]];
 const activity=tabs.map(([key,label])=>{
  const records=r[key]||[];
  if(key==="taxReturns"){
   const filed=records.filter(isFiledReturn);
   return '<div class="e-dossier-line"><div><strong>'+E(label)+'</strong><span>'+number(filed.length)+
    ' shown'+(partial.includes(key)?" · dossier limited to 100 returns":"")+'</span></div>'+
    (filed.length?'<div class="e-dossier-items">'+filed.map(item=>
     '<button class="link" data-e-filing="'+E(item.id)+'">'+E(item.caseNumber||item.id)+' · '+E(item.taxYear)+'</button>'
    ).join("")+'</div>':'<small>No filed returns found</small>')+'</div>';
  }
  return '<div class="e-dossier-line"><div><strong>'+E(label)+'</strong><span>'+number(records.length)+' linked records'+(partial.includes(key)?" (limited to 100)":"")+'</span></div>'+
   (records.length?'<div class="e-dossier-items">'+records.slice(0,8).map(y=>'<span>'+E(y.caseNumber||y.title||y.id.slice(0,14))+
   ' · '+E(y.status||y.taxYear||"Recorded")+'</span>').join("")+'</div>':
    '<small>No records yet</small>')+'</div>';
 }).join("");
 return title(s,h,"Unified taxpayer dossier","A complete view of this fictional account, subject to the displayed record limits.",
 '<button class="button" id="e-document-center">Document Studio</button>')+
 '<section class="e-hero compact"><div><div class="e-overline">INSTITUTIONAL TAXPAYER FILE</div><h2>'+E(x.fullName)+'</h2><p>'+E(x.taxpayerNumber)+' · '+E(x.region)+' · '+E(x.type)+'</p></div>'+pill(x.simulated?"Simulated NPC":"Taxpayer record","gold")+'</section>'+
 '<div class="e-metrics">'+
 ledger("Assessed tax",cash(t.assessedCents),"Combined displayed tax accounts")+
 ledger("Outstanding liability",cash(t.outstandingCents),"Current recorded amount")+
 ledger("Payments received",cash(t.directPaymentsCents),"Simulated Treasury receipts")+
 ledger("Available taxpayer credit",cash(t.creditAvailableCents),"Credit across recorded accounts")+'</div>'+
 '<div class="e-dual"><section class="card e-card">'+heading("Identity & registry")+
 '<div class="e-stat-list">'+row("Full name",x.fullName)+row("Taxpayer reference",x.taxpayerNumber)+
 row("Classification",x.type)+row("Region",x.region)+row("Record status",x.status)+
 row("Account origin",x.simulated?"Fictional NPC":"Registered/agency taxpayer")+
 row("Portal access",portalStatus(x))+(x.portalName?row("Portal login name",x.portalName):"")+
 row("Date registered",toDate(x.createdAt))+'</div></section>'+
 '<section class="card e-card">'+heading("Financial standing")+
 '<div class="e-stat-list">'+row("Tax assessed",cash(t.assessedCents))+
 row("Declared prepayments",cash(t.declaredPaymentsCents))+
 row("Direct remittances",cash(t.directPaymentsCents))+
 row("Credits available",cash(t.creditAvailableCents))+
 row("Refunds disbursed",cash(t.refundsDisbursedCents))+
 row("Credits reserved",cash(t.reservedRefundCents))+'</div></section></div>'+
 '<section class="card e-card">'+heading("Connected agency records","Up to 100 entries per category")+
 '<div class="e-dossier-list">'+activity+'</div></section>'+
 '<div class="e-action-strip"><button class="button" id="e-print-statement">Print taxpayer account statement</button><button class="button secondary" id="e-calendar">Tax calendar</button>'+
 (x.type==="business"?'<button class="button secondary" id="e-business-taxes">Business tax accounts</button>':"")+
 (s.me?.role==="commissioner"&&portalStatus(x)==="Ready to convert"?'<button class="button secondary" id="e-activate-portal">Create portal login</button>':"")+
 (s.me?.role==="commissioner"&&x.ownerLinked&&x.portalName&&x.status==="active"?'<button class="button secondary" id="e-reset-portal">Reset portal password</button>':"")+
 (canStaff(s)?'<button class="button secondary" id="e-registry-return">Return to registry</button>':"")+'</div>'+
 '<p class="tax-disclaimer">All taxpayer accounts, filings and financial figures are fictional. Document Studio prints a clearly labeled RP record.</p>';
}
function documentChoices(){
 if(!dossier)return [];
 const r=dossier.records||{},choices=[["statement","Taxpayer account statement",null]];
 for(const [kind,label] of [
  ["taxReturns","Tax return summary"],["taxAssessments","Assessment notice"],
  ["treasuryReceipts","Payment receipt"],["treasuryRefunds","Refund determination"],
  ["treasuryPlans","Installment agreement"],["agencyCases","Administrative case notice"]
 ])for(const entry of (r[kind]||[]))choices.push([kind,label,entry]);
 return choices;
}
function documentPage(s,h){
 if(!dossier)return title(s,h,"Document Studio","Generate high-quality printable documents from existing records.")+
 empty("Select a taxpayer",canStaff(s)?"Choose a taxpayer from the registry, then open Document Studio.":"Your taxpayer record is not available.");
 const choices=documentChoices();
 if(!choices.some(c=>c[0]===recordKind&&(c[2]?.id||"")===recordId)){recordKind="statement";recordId="";}
 const selection=choices.find(c=>c[0]===recordKind&&(c[2]?.id||"")===recordId)||choices[0];
 const record=selection[2],t=dossier.taxpayer;
 return title(s,h,"Institutional Document Studio","Print professional fictional tax statements, assessments, receipts and administrative notices.")+
 '<div class="e-hero compact"><div><div class="e-overline">URA · OFFICIAL RECORD DESIGN</div><h2>A complete institutional paper trail.</h2><p>Printable letter-size records, clear simulated-document markings, reference numbers and signature lines.</p></div></div>'+
 '<div class="e-dual"><section class="card e-card">'+heading("Document settings","Select a source record")+
 '<div class="field"><label>Taxpayer account</label><div class="e-readonly">'+E(t.fullName)+' · '+E(t.taxpayerNumber)+'</div></div>'+
 '<div class="field"><label for="e-doc-record">Document template and source</label><select class="input" id="e-doc-record">'+choices.map(c=>
 '<option value="'+E(c[0]+"|"+(c[2]?.id||""))+'" '+(c===selection?"selected":"")+'>'+E(c[1])+
 (c[2]?" · "+E(c[2].caseNumber||c[2].id.slice(0,10)):"")+'</option>').join("")+'</select></div>'+
 '<div class="e-report-note">Every generated page is prominently labeled as a fictional roleplay document, not a government or legal record. No real-world money transfers or digital signatures are created.</div>'+
 '<button class="button" id="e-print-document">Open printable record</button></section>'+
 '<section class="card e-card">'+heading("Preview · "+selection[1])+
 '<div class="e-print-preview"><div class="e-preview-brand"><span>UNIFIED REVENUE AUTHORITY</span><strong>URA</strong></div>'+
 '<div class="e-preview-watermark">FICTIONAL ROLEPLAY RECORD</div><h3>'+E(selection[1])+'</h3>'+
 '<div class="e-stat-list">'+row("Taxpayer",t.fullName)+row("Record reference",record?.caseNumber||record?.id||t.taxpayerNumber)+
 row("Tax period",record?.taxYear||"All periods")+
 row("Source",record?selection[0].replaceAll("_"," "):"Complete taxpayer account")+
 row("Date",toDate(record?.createdAt||dossier.issuedAt))+'</div>'+
 '<div class="e-preview-signature">Agency officer · Fictional acknowledgment</div></div></section></div>'+
 '<p class="tax-disclaimer">Document Studio only creates printable representations of existing fictional URA records. Printing does not issue or post a new transaction.</p>';
}
function printTaxpayerStatement(){
 if(!dossier)throw Error("Select an account first.");
 const x=dossier.taxpayer,t=dossier.totals,r=dossier.records;
 const balance=[
 ["Assessed tax",cash(t.assessedCents)],["Declared prepayments",cash(t.declaredPaymentsCents)],
 ["Direct payments",cash(t.directPaymentsCents)],["Outstanding liability",cash(t.outstandingCents)],
 ["Available credits",cash(t.creditAvailableCents)],["Refunds issued",cash(t.refundsDisbursedCents)]];
 const accounts=(r.treasuryAccounts||[]).map(a=>[String(a.taxYear),a.returnType,cash(a.assessedCents),cash(a.outstandingCents),cash(a.creditAvailableCents)]);
 printDocument({heading:"Consolidated Taxpayer Statement",subtitle:"Fictional taxpayer financial position",reference:x.taxpayerNumber,
 rows:[["Taxpayer",x.fullName],["Region",x.region],["Classification",x.type],["Account status",x.status]],
 sections:[{title:"Consolidated financial statement",rows:[["Account classification","Amount"],...balance]},
  {title:"Fiscal tax accounts",rows:[["Year","Tax type","Assessed","Outstanding","Credit"],...accounts]},
  {title:"Records included",body:"Returns: "+(r.taxReturns||[]).length+"; assessments: "+(r.taxAssessments||[]).length+
   "; receipts: "+(r.treasuryReceipts||[]).length+"; refunds: "+(r.treasuryRefunds||[]).length+
   ". Any record-count limits shown in the digital dossier also apply to this statement."}],
 footer:dossier.disclaimer+" No money or tax liability exists outside the simulation."});
}
function printRecord(kind,rec){
 if(!rec||!dossier)throw Error("Select a document record first.");
 const t=dossier.taxpayer;
 if(kind==="taxReturns"){printFullFiling({...rec,taxpayerName:t.fullName});return;}
 const source={taxReturns:"Filing Review Summary",taxAssessments:"Formal Assessment Notice",
  treasuryReceipts:"Simulated Payment Receipt",treasuryRefunds:"Refund Case Notice",
  treasuryPlans:"Installment Agreement",agencyCases:"Administrative Case Notice"}[kind]||"Administrative Record";
 const id=rec.caseNumber||rec.id;
 const details=kind==="taxReturns"?[
 ["Filing status",statuses[rec.status]||rec.status],["Tax liability",cash(rec.calculation?.taxDueCents)],
 ["Reported payments",cash(rec.calculation?.paymentsCents)],["Refund claim",cash(rec.calculation?.refundCents)],
 ["Outstanding balance",cash(rec.calculation?.balanceCents)]]:
 kind==="taxAssessments"?[["Assessed liability",cash(rec.taxDueCents)],["Adjustment",cash(rec.deltaTaxCents)]]:
 kind==="treasuryReceipts"?[["Receipt amount",cash(rec.amountCents)],["Payment method",(rec.method||"").replaceAll("_"," ")],["Posting status",rec.status]]:
 kind==="treasuryRefunds"?[["Requested refund",cash(rec.amountCents)],["Processing status",rec.status],["Case narrative",rec.reason]]:
 kind==="treasuryPlans"?[["Arrangement amount",cash(rec.amountCents)],["Amount paid",cash(rec.paidCents)],["Installments",rec.installmentCount],["Status",rec.status]]:
 [["Case type",rec.kind],["Subject",rec.title],["Case status",rec.status]];
 const planRows=kind==="treasuryPlans"?(rec.schedule||[]).map(x=>[String(x.installment),String(x.dueDate),cash(x.amountCents)]):[];
 const sections=[{title:"Recorded administrative information",rows:[["Field","Recorded value"],...details]}];
 if(planRows.length)sections.push({title:"Installment schedule",rows:[["Installment","Due date","Amount"],...planRows]});
 printDocument({heading:source,subtitle:"Fictional agency record generated from recorded institutional data",reference:id,
 rows:[["Taxpayer",t.fullName],["Fiscal year",rec.taxYear||"—"],
  ["Administrative classification",t.type],["Document state",rec.status||"Recorded"]],
 sections,footer:"ROLEPLAY ONLY — no actual government determination, receipt, payment or collection. Administrative content is for simulated gameplay."});
}
function printExecutive(source,popup=null){
 const r=source.snapshot||source;
 if(!r)throw Error("Select a fiscal report first.");
 const title=source.title||("Fiscal "+r.taxYear+" — Revenue Operations Review");
 const findings=source.findings||"This report is an on-demand fiscal summary of fictional revenue administration. Totals and samples are explicitly marked below.";
 const t=r.totals||{},f=r.financial||{};
 const metrics=[
 ["Registered taxpayer records",number(t.taxpayers)],["Year returns",number(t.fiscalFilings)],
 ["Fiscal tax accounts",number(t.fiscalAccounts)],["Fiscal cases",number(t.fiscalCases)],
 ["Assessed liability",cash(f.assessedCents)],["Outstanding receivables",cash(f.outstandingCents)],
 ["Payments received",cash(f.directPaymentsCents)],["Available credits",cash(f.creditAvailableCents)]
 ];
 const coverageRows=Object.entries(r.coverage||{}).filter(([k])=>k!=="refunds").map(([k,v])=>
  [k,number(v.sampled)+" / "+number(v.total),v.complete?"Complete":"Sampled / Partial"]);
 printDocument({heading:title,subtitle:"Executive revenue and operational intelligence",
  reference:source.reference||("URA-FISCAL-"+r.taxYear),
  rows:[["Fiscal year",r.taxYear],["Reporting prepared",toDate(r.generatedAt)],
    ["Memorandum status",source.status||"On-demand preview"]],
  sections:[{title:"Executive findings",body:findings},
   {title:"Institutional financial scorecard",rows:[["Measure","Recorded figure"],...metrics]},
   {title:"Source coverage and limitations",rows:[["Record set","Included / total","Coverage"],...coverageRows]},
   {title:"Accounting integrity",body:"Simulated ledger controls: "+
    (r.ledger?.balanced?"Balanced":"Discrepancy requires review")+
    ". Debits: "+cash(r.ledger?.totalDebitsCents)+". Credits: "+cash(r.ledger?.totalCreditsCents)+". "+
    "This report uses no extrapolation where fiscal account coverage is incomplete."}],
  issuer:source.issuedByName,
  footer:"FICTIONAL ROLEPLAY ANALYSIS ONLY · Not an official government, financial or accounting document."},popup);
}
export async function enterpriseLoad(s){
 if(!enterprisePages.includes(s.page))return;
 if(s.page==="executive"){
  if(!canStaff(s))return;
  const [r,listing]=await Promise.all([
   call("getExecutiveReport",{taxYear:year}),
   call("listExecutiveReports")
  ]);
  report=r.data;issued=listing.data.items||[];
 }
 if(s.page==="registry"&&canStaff(s)){
  const r=await call("listAgencyRegistryPage",{prefix:registryPrefix,cursor:registryCursor});
  registry=r.data.items||[];registryNext=r.data.nextCursor||null;
 }
 if(["dossier","documents"].includes(s.page)){
  const id=canStaff(s)?selectedTaxpayerId:s.me?.taxpayerId;
  if(!id){dossier=null;return;}
  const viewer=s.user?.uid;
  const r=await call("getTaxpayerDossier",{taxpayerId:id});
  const currentId=canStaff(s)?selectedTaxpayerId:s.me?.taxpayerId;
  if(s.user?.uid===viewer&&currentId===id){
   dossier=r.data;
   dossierViewer=viewer;
  }
 }
}
export function enterprisePageHTML(s,h){
 if(dossierViewer!==s.user?.uid)dossier=null;
 if(s.page==="executive")return execPage(s,h);
 if(s.page==="registry")return registryPage(s,h);
 if(s.page==="dossier")return dossierPage(s,h);
 if(s.page==="documents")return documentPage(s,h);
 return "";
}
function reloadPage(h){return h.reload();}
export function enterprisePageBind(s,h){
 for(const [id,route] of [["e-calendar","calendar"],["e-business-taxes","business-taxes"]]){
  document.getElementById(id)?.addEventListener("click",()=>{if(!dossier)return;selectOperationsTaxpayer(dossier.taxpayer.id);location.hash=route;});
 }
 if(!enterprisePages.includes(s.page))return;
 document.getElementById("e-year")?.addEventListener("change",ev=>{year=Number(ev.target.value);reloadPage(h);});
 document.getElementById("e-refresh")?.addEventListener("click",()=>reloadPage(h));
 document.getElementById("e-export")?.addEventListener("click",()=>{
  if(!report)return;
  const rows=[["URA — FICTIONAL FISCAL REPORT",String(year)],["Metric","Value (fictional USD)"],
   ["Fiscal taxpayers",report.totals?.fiscalAccounts],
   ["Filed returns",report.totals?.fiscalFilings],
   ["Assessed tax (USD)",(report.financial?.assessedCents||0)/100],
   ["Outstanding liability (USD)",(report.financial?.outstandingCents||0)/100],
   ["Direct payments (USD)",(report.financial?.directPaymentsCents||0)/100],
   ["Available credits (USD)",(report.financial?.creditAvailableCents||0)/100],
   [],["Month","Posted receipts (USD)","Sample count"],
   ...(report.trend||[]).map(m=>[m.label,(m.receiptCents/100).toFixed(2),m.receiptCount]),
   [],["SOURCE COVERAGE","Sampled","Total"],
   ...Object.entries(report.coverage||{}).filter(([k])=>k!=="refunds").map(([k,v])=>[k,v.sampled,v.total])];
  createCSV("URA_Fiscal_"+year,rows);
 });
 document.getElementById("e-print-preview")?.addEventListener("click",()=>{try{printExecutive(report);}catch(e){h.toast(e.message,true);}});
 document.getElementById("e-issue-form")?.addEventListener("submit",async ev=>{
  ev.preventDefault();
  const btn=ev.currentTarget.querySelector('[type="submit"]');btn.disabled=true;
  try{
   const res=await call("issueExecutiveReport",{taxYear:year,title:document.getElementById("e-report-title").value,
    findings:document.getElementById("e-report-findings").value});
   h.toast("Executive memorandum "+res.data.reference+" issued.");
   await reloadPage(h);
  }catch(e){h.toast(e.message,true);}finally{btn.disabled=false;}
 });
 document.querySelectorAll("[data-e-issued]").forEach(button=>button.addEventListener("click",async()=>{
  // A printable window is opened synchronously to avoid browser popup blocking.
  const popup=window.open("","_blank");
  if(!popup){h.toast("Please allow pop-ups to print a memorandum.",true);return;}
  popup.document.write('<!doctype html><title>Opening report</title><p>Loading fictional executive memorandum…</p>');
  try{
   const r=await call("getIssuedExecutiveReport",{reportId:button.dataset.eIssued});
   printExecutive(r.data,popup);
  }catch(e){popup.close();h.toast(e.message,true);}
 }));
 document.getElementById("e-registry-search")?.addEventListener("submit",ev=>{
  ev.preventDefault();registryPrefix=document.getElementById("e-prefix").value.trim();
  registryCursor=null;registryStack=[];reloadPage(h);
 });
 document.getElementById("e-clear-search")?.addEventListener("click",()=>{
  registryPrefix="";registryCursor=null;registryStack=[];reloadPage(h);
 });
 document.getElementById("e-next-page")?.addEventListener("click",()=>{
  if(!registryNext)return;
  registryStack.push(registryCursor);registryCursor=registryNext;reloadPage(h);
 });
 document.getElementById("e-prev-page")?.addEventListener("click",()=>{
  if(!registryStack.length)return;
  registryCursor=registryStack.pop()||null;reloadPage(h);
 });
 document.querySelectorAll("[data-e-activate]").forEach(button=>button.addEventListener("click",()=>{
  if(s.me?.role!=="commissioner")return;
  const t=registry.find(x=>x.id===button.dataset.eActivate);
  if(t)openPortalActivation(t,{modal:h.modal,toast:h.toast,reload:reloadPage.bind(null,h)});
 }));
 document.getElementById("e-activate-portal")?.addEventListener("click",()=>{
  if(s.me?.role!=="commissioner"||!dossier)return;
  openPortalActivation(dossier.taxpayer,{modal:h.modal,toast:h.toast,reload:reloadPage.bind(null,h)});
 });
 document.getElementById("e-reset-portal")?.addEventListener("click",()=>{
  if(s.me?.role==="commissioner"&&dossier)openPortalReset(dossier.taxpayer,h);
 });
 document.querySelectorAll("[data-e-filing]").forEach(button=>button.addEventListener("click",()=>{
  if(dossierViewer!==s.user?.uid)return;
  const filing=dossier?.records?.taxReturns?.find(item=>item.id===button.dataset.eFiling);
  if(filing)openReturnDetails({...filing,taxpayerName:dossier.taxpayer.fullName},s,h,{readOnly:true});
 }));
 document.querySelectorAll("[data-e-dossier]").forEach(button=>button.addEventListener("click",()=>{
  selectedTaxpayerId=button.dataset.eDossier;dossier=null;location.hash="#dossier";
 }));
 document.getElementById("e-document-center")?.addEventListener("click",()=>{location.hash="#documents";});
 document.getElementById("e-registry-return")?.addEventListener("click",()=>{location.hash="#registry";});
 document.getElementById("e-print-statement")?.addEventListener("click",()=>{try{printTaxpayerStatement();}catch(e){h.toast(e.message,true);}});
 document.getElementById("e-doc-record")?.addEventListener("change",ev=>{
  const split=ev.target.value.split("|");recordKind=split[0];recordId=split.slice(1).join("|");h.renderShell();
 });
 document.getElementById("e-print-document")?.addEventListener("click",()=>{
  try{
   if(recordKind==="statement")printTaxpayerStatement();
   else{
    const x=(dossier?.records?.[recordKind]||[]).find(x=>x.id===recordId);
    if(!x)throw Error("Select an available agency record.");
    printRecord(recordKind,x);
   }
  }catch(e){h.toast(e.message,true);}
 });
}
