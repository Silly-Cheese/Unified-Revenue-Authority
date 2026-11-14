import {call} from "./auth.js";
import {escapeHTML as E, centsText as cash, printDocument} from "./documents.js";
import {createRequestDialog, openInformationRequest, operationForm} from "./operations.js";


const supervisors = ["commissioner", "supervisor"];
const examiners = [...supervisors, "auditor"];
const action = (id, label) => `<button id="${id}" class="button secondary" type="button">${E(label)}</button>`;
const get = async (name, data) => (await call(name,data)).data;
const input = (name,label,attributes = "") => `<label class="field ops-field"><span>${E(label)}</span><input class="input" name="${name}" ${attributes}></label>`;
const note = label => `<label class="field ops-field"><span>${E(label)}</span><textarea class="input" name="reason" required minlength="12" maxlength="1500" rows="4"></textarea></label>`;
const amount = (name,label) => input(name,label,'type="number" min="0.01" step="0.01" required');
const active = c => !["closed", "resolved"].includes(c.status);
const status = value => String(value || "").replaceAll("_", " ");
const option = (value,label) => `<option value="${E(value)}">${E(label)}</option>`;
export function caseTools(s,c) {
 const examiner = examiners.includes(s.me?.role);
 const staff = s.me?.role !== "citizen";
 const requests = c.kind !== "investigation" ? action("c-requests", "Information requests") : "";
 const workpapers = examiner && ["audit", "investigation"].includes(c.kind) ? action("c-workpapers", "Examination workpapers") : "";
 const collections = c.kind === "collection" ? action("c-relief", "Collections & relief") : "";
 const assessment = staff ? action("c-assessment", "Linked assessment") : "";
 return `<div class="ops-actions">${requests}${workpapers}${collections}${assessment}</div>`;
}
function reopen(el, fn) { if(el.isConnected){el.remove();return fn();} }
export function bindCaseTools(el,s,h,c,back) {
 el.querySelector("#c-requests")?.addEventListener("click", () => reopen(el, () => showRequests(s,h,c,back)));
 el.querySelector("#c-workpapers")?.addEventListener("click", () => reopen(el, () => showWorkpapers(s,h,c,back)));
 el.querySelector("#c-relief")?.addEventListener("click", () => reopen(el, () => openCollectionDetails(s,h,c.id,back)));
 el.querySelector("#c-assessment")?.addEventListener("click", async () => {
  try {
   const data = await get("getCaseAssessment", {caseId:c.id});
   reopen(el, () => {
    const rows = [["Filing",data.caseNumber],["Originally assessed",cash(data.filingTaxCents)],["Current assessment",cash(data.assessedCents)],
     ["Payments received",cash(data.paidCents)],["Outstanding balance",cash(data.outstandingCents)],["Payment deadline",data.paymentDue || "—"]];
    h.modal("Linked assessment", `<div class="modal-body"><dl class="tax-filing-rows">${rows.map(([label,value])=>`<div><dt>${E(label)}</dt><dd>${E(value)}</dd></div>`).join("")}</dl>${data.returnId?`<a class="link" href="#filings/${E(data.returnId)}">Open assessed return</a>`:""}</div><div class="modal-bottom">${action("c-back-tools","Back to case file")}<button class="button secondary" data-close>Close</button></div>`, node => {
     node.querySelector("#c-back-tools").addEventListener("click",()=>reopen(node,back));
     node.querySelector("a")?.addEventListener("click",()=>node.remove());
    });
   });
  } catch (err) {h.toast(err.message,true);}
 });
}
async function showRequests(s,h,c,back) {
 try {
  const uid=s.user?.uid;
  const result = await get("listInformationRequests", {caseId:c.id});
  if(s.user?.uid!==uid)return;
  const staff = s.me?.role !== "citizen";
  h.modal("Case information requests", `<div class="modal-body"><div data-request-list></div></div><div class="modal-bottom">${staff&&active(c)?action("c-new-request","Request information"):""}${action("c-back-tools","Back to case file")}</div>`, el => {
   const list=el.querySelector("[data-request-list]");
   function append(page){
    const more=list.querySelector("#c-more-requests");more?.remove();
    for(const row of page.items){
     const button=document.createElement("button");button.className="c-notice";button.type="button";
     button.innerHTML=`<strong>${E(row.title)}</strong><small>Due ${E(row.due)} · ${E(status(row.status))}</small>`;
     button.addEventListener("click",()=>reopen(el,()=>openInformationRequest(h,s,row,()=>showRequests(s,h,c,back))));list.append(button);
    }
    if(page.next){
     const button=document.createElement("button");button.className="button secondary";button.id="c-more-requests";button.textContent="More requests";
     button.addEventListener("click",async()=>{button.disabled=true;try{const next=await get("listInformationRequests",{caseId:c.id,cursor:page.next});if(el.isConnected)append(next);}catch(err){h.toast(err.message,true);button.disabled=false;}});
     list.append(button);
    }
   }
   if(!result.items.length)list.textContent="No information requests are linked to this case.";
   append(result);
   el.querySelector("#c-new-request")?.addEventListener("click",()=>reopen(el,()=>createRequestDialog(h,c.id,()=>showRequests(s,h,c,back))));
   el.querySelector("#c-back-tools").addEventListener("click",()=>reopen(el,back));
  });
 } catch (err) {h.toast(err.message,true);}
}
async function showWorkpapers(s,h,c,back) {
 try {
  const uid=s.user?.uid;
  const data = await get("getExaminationWorkpapers", {caseId:c.id});
  if(s.user?.uid!==uid)return;
  const {filingFields}=await import("./tax.js");
  if(s.user?.uid!==uid)return;
  const fields = filingFields(c.returnType);
  const rows = data.items.map(row=>`<tr><td>${E(row.filingReference)}</td><td>${E(fields.find(([key])=>key===row.field)?.[1]||row.field)}</td><td>${E(cash(row.reportedCents))}</td><td>${E(cash(row.verifiedCents))}</td><td>${E(row.note)}</td></tr>`).join("");
  h.modal("Examination workpapers · "+c.caseNumber, `<div class="modal-body">${rows?`<div class="table-wrap"><table class="table"><thead><tr><th>Return</th><th>Line</th><th>Reported</th><th>Verified</th><th>Finding</th></tr></thead><tbody>${rows}</tbody></table></div>`:"<p>No line findings yet.</p>"}<p class="help">Current assessment ${E(cash(data.assessedCents))}</p><div data-preview role="status"></div></div><div class="modal-bottom">${active(c)&&data.latestReturnId?action("c-add-finding","Record line finding"):""}${rows?action("c-preview-finding","Preview assessment impact"):""}${action("c-back-tools","Back to case file")}</div>`, el=>{
   el.querySelector("#c-add-finding")?.addEventListener("click",()=>reopen(el,()=>{
    operationForm(h,"Record line finding",`<label class="field ops-field">Filing line<select class="input" name="field">${fields.map(([key,label])=>option(key,label)).join("")}</select></label>`+
     input("verified","Verified amount ($)",'type="number" min="0" step="0.01" required')+note("Finding and supporting explanation"),"Save workpaper",
     form=>call("saveExaminationWorkpaper",{caseId:c.id,returnId:data.latestReturnId,field:form.field,verified:form.verified,note:form.reason}),()=>showWorkpapers(s,h,c,back));
   }));
   el.querySelector("#c-preview-finding")?.addEventListener("click",async()=>{
    const target=el.querySelector("[data-preview]");target.textContent="Calculating…";
    try {const result=await get("previewExaminationAdjustment",{caseId:c.id});target.textContent=`Proposed assessment ${cash(result.amount)} · Change ${cash(result.deltaCents)} · ${result.reviewedLines} verified lines`;
     if(c.kind==="investigation")target.textContent+=` · Investigation reference for adjustment: ${c.caseNumber}`;
    }catch(err){target.textContent=err.message;}
   });
   el.querySelector("#c-back-tools").addEventListener("click",()=>reopen(el,back));
  });
 } catch (err) {h.toast(err.message,true);}
}
export async function openCollectionDetails(s,h,id,back=null) {
 try {
  const uid=s.user?.uid;
  const data=await get("getCollectionDetails",{caseId:id});
  if(s.user?.uid!==uid)return;
  const account=data.account;
  const waiver=data.waiver;
  const supervisor=supervisors.includes(s.me?.role);
  const choices=[];
  if(data.active&&account){
   if(account.penaltyCents>0&&waiver?.status!=="requested")choices.push(["request_waiver","Request penalty waiver"]);
   if(supervisor){
    if(!account.hold?.active&&account.outstandingCents>0)choices.push(["add_penalty","Post a penalty"]);
    if(account.hold)choices.push(["release_hold","Release collection hold"]);
    if(!account.hold?.active)choices.push(["place_hold","Place hold during appeal"]);
    if(waiver?.status==="requested"&&waiver.requestedBy!==uid)choices.push(["approve_waiver","Approve waiver"],["deny_waiver","Deny waiver"]);
   }
  }
  const closure=data.closure;
  h.modal("Collections & relief", `<div class="modal-body"><p><strong>${E(data.caseNumber)}</strong></p><p>Outstanding ${E(cash(account?.outstandingCents))} · Penalties ${E(cash(account?.penaltyCents))}</p>
   ${account?.hold?`<p>Hold ${account.hold.active?"active":"expired"} · Through ${E(account.hold.until)} · ${E(account.hold.reason)}</p>`:""}
   ${waiver?`<p>Waiver ${E(status(waiver.status))} · ${E(cash(waiver.amountCents))} · ${E(waiver.decisionReason||waiver.reason)}</p>`:""}
   ${closure?`<h3>Closure statement</h3><p class="ops-pre">${E(closure.reason)}</p><p>Closing balance ${E(cash(closure.outstandingCents))} · ${E(closure.officer)}</p>${action("c-print-closure","Print closure statement")}`:""}
   <div class="ops-actions">${choices.map(([key,label])=>`<button class="button secondary" type="button" data-relief="${key}">${E(label)}</button>`).join("")}</div></div><div class="modal-bottom">${back?action("c-back-tools","Back to case file"):""}<button class="button secondary" data-close>Close</button></div>`,el=>{
   el.querySelector("#c-print-closure")?.addEventListener("click",()=>{
    try{printDocument({heading:"Collections closure statement",reference:data.caseNumber,rows:[["Taxpayer",data.taxpayerName],["Closing balance",cash(closure.outstandingCents)],["Assessment",cash(closure.assessedCents)],["Payments received",cash(closure.paidCents)],["Officer",closure.officer]],sections:[{title:"Closure explanation",body:closure.reason}]});}catch(err){h.toast(err.message,true);}
   });
   el.querySelectorAll("[data-relief]").forEach(btn=>btn.addEventListener("click",()=>reopen(el,()=>{
    const key=btn.dataset.relief;
    const fields=(["add_penalty","request_waiver"].includes(key)?amount("amount","Amount ($)"):"")+
     (key==="place_hold"?input("appealId","Appeal case reference",'required maxlength="150"')+input("until","Hold through",'type="date" required'):"");
    operationForm(h,btn.textContent,fields+note("Reason"),"Record action",form=>call("collectionAction",{...form,caseId:id,action:key}),()=>openCollectionDetails(s,h,id,back));
   })));
   el.querySelector("#c-back-tools")?.addEventListener("click",()=>reopen(el,back));
  });
 }catch(err){h.toast(err.message,true);}
}
