import {call} from "./auth.js";
import {db} from "./firebase.js";
import {collection, documentId, getDocs, limit, orderBy, query, startAt, endAt, where} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";
import {serviceMessage} from "./service-status.js";
import {escapeHTML as E, centsText as cash, printDocument} from "./documents.js";

export const operationsPages = ["calendar", "business-taxes", "wage-statements", "notices"];
export const businessFields = {
 sales: [["grossSales", "Gross sales"], ["exemptSales", "Exempt sales"], ["estimatedPayments", "Prior payments"]],
 payroll: [["grossPayroll", "Gross payroll"], ["exemptPayroll", "Exempt payroll"], ["taxWithheld", "Tax withheld from employees"], ["estimatedPayments", "Prior remittances"]]
};
const taxTypes = {individual: "Individual income tax", business: "Business income tax", sales: "Sales tax", payroll: "Employer withholding"};
const titles = {calendar: "Tax calendar & extensions", "business-taxes": "Business tax accounts", "wage-statements": "Wage & withholding statements", notices: "Agency notices & responses"};
const labels = {unfiled: "Unfiled", draft: "Draft", submitted: "Awaiting review", information_requested: "Information requested", rejected: "Correction required", accepted: "Accepted"};
export const taxLabel = type => taxTypes[type] || type;
export function periodLabel(type, year, period) {
 if (type === "sales" && period) return new Intl.DateTimeFormat("en-US", {month: "long", year: "numeric", timeZone: "UTC"}).format(new Date(Date.UTC(year, period - 1, 1)));
 return type === "payroll" && period ? `Q${period} ${year}` : String(year);
}
const staff = s => Boolean(s.me?.role && s.me.role !== "citizen");
const supervisor = s => ["commissioner", "supervisor"].includes(s.me?.role);
const commissioner = s => s.me?.role === "commissioner";
const loadCall = async (name, data) => (await call(name, data)).data;
const textStatus = value => String(value || "").replaceAll("_", " ");
const cell = value => `<td>${E(value)}</td>`;
const actionButton = (attr, id, title) => `<button class="link" type="button" ${attr}="${E(id)}">${E(title)}</button>`;
const panel = (title, content, action = "") => `<section class="card card-pad ops-panel"><div class="section-head"><h2>${E(title)}</h2>${action}</div>${content}</section>`;
const table = (heads, rows, empty = "No records found.") => rows.length ? `<div class="table-wrap"><table class="table"><thead><tr>${heads.map(head => `<th scope="col">${E(head)}</th>`).join("")}</tr></thead><tbody>${rows.map(row => `<tr>${row}</tr>`).join("")}</tbody></table></div>` : `<p class="help">${E(empty)}</p>`;
const textInput = (name, label, attributes = "", value = "") => `<label class="field ops-field"><span>${E(label)}</span><input class="input" name="${name}" ${attributes} value="${E(value)}"></label>`;
const area = (name, label, max = 1500, value = "", required = true) => `<label class="field ops-field"><span>${E(label)}</span><textarea class="input" name="${name}" rows="4" maxlength="${max}" ${required ? "required" : ""}>${E(value)}</textarea></label>`;
const options = (choices, selected) => choices.map(([value, label]) => `<option value="${E(value)}" ${String(value) === String(selected) ? "selected" : ""}>${E(label)}</option>`).join("");
const select = (name, label, choices, selected) => `<label class="field ops-field"><span>${E(label)}</span><select name="${name}" class="input">${options(choices, selected)}</select></label>`;
const amountInput = (name, label, value = "0.00") => textInput(name, label, 'type="number" min="0" max="999999999.99" step="0.01" required', value);

let context = null;
let selection = "";
let year = null;
let owner = null;
let operationLoad = 0;
export function selectOperationsTaxpayer(id) { selection = id; }
export function resetOperations() { context = null; selection = ""; owner = null; year = null; }
export async function operationsLoad(s) {
 const uid = s.user?.uid, page = s.page, target = s.routeTarget || "";
 const load = ++operationLoad;
 if (owner !== uid) { selection = ""; year = null; owner = uid; }
 if (Number(target) >= 2025 && Number(target) <= 2035 && page === "calendar") year = Number(target);
 if (staff(s) && page !== "notices" && !selection && s.me.taxpayerId) selection = s.me.taxpayerId;
 const taxpayerId = staff(s) ? selection : s.me.taxpayerId;
 const args = {taxpayerId: taxpayerId || undefined, year};
 const data = {page, target, uid, errors: {}, taxpayerId};
 const fetchPanel = async (key, endpoint, payload) => {
  try { data[key] = await loadCall(endpoint, payload); }
  catch (error) { data.errors[key] = serviceMessage(error); }
 };
 const jobs = [];
 if (page === "notices") {
  jobs.push(fetchPanel("requests", "listInformationRequests", {openOnly: staff(s)}), fetchPanel("letters", "listPortalNotices"));
  if (target.startsWith("letter_")) jobs.push(fetchPanel("detail", "getPortalNotice", {id: target.slice(7)}));
  else if (target && !target.startsWith("collection_")) jobs.push(fetchPanel("detail", "getInformationRequest", {id: target}));
 } else {
  if (taxpayerId || !staff(s)) {
   jobs.push(fetchPanel("calendar", "getFilingCalendar", args));
   if (page === "wage-statements") jobs.push(fetchPanel("statements", "listWageStatements", args));
  }
  if (page === "calendar" && staff(s)) jobs.push(fetchPanel("extensions", "listFilingExtensions"));
 }
 await Promise.all(jobs);
 if (load === operationLoad && s.user?.uid === uid && s.page === page && s.routeTarget === target) {
  context = data;
  if (data.calendar?.year) year = data.calendar.year;
 }
}
async function registryLookup(input) {
 const taxpayers = collection(db, "taxpayers");
 const value = input.normalize("NFKC").trim();
 const reference = /^(URA|NPC)-[a-z0-9]{20}$/i.test(value);
 const docId = /^[A-Za-z0-9]{20}$/.test(value);
 const titleCase = value.toLowerCase().replace(/(^|[\s'-])\p{L}/gu, letter => letter.toUpperCase());
 const queries = reference ? [query(taxpayers, where("taxpayerNumber", "==", value.toUpperCase()), limit(10))] :
  [...new Set([value, titleCase])].map(prefix => query(taxpayers, orderBy("fullName"), startAt(prefix), endAt(prefix + "\uf8ff"), limit(20)));
 if (docId) queries.push(query(taxpayers, where(documentId(), "==", value), limit(1)),
  ...["URA", "NPC"].map(prefix => query(taxpayers, where("taxpayerNumber", "==", prefix + "-" + value.toUpperCase()), limit(2))));
 const docs = (await Promise.all(queries.map(item => getDocs(item)))).flatMap(snapshot => snapshot.docs);
 return [...new Map(docs.map(doc => {
  const data = doc.data();
  return [doc.id, {id: doc.id, name: data.fullName, type: data.type, reference: data.taxpayerNumber || doc.id}];
 })).values()].sort((a,b) => a.name.localeCompare(b.name)).slice(0,30);
}
function searchTaxpayer(h, s) {
 const uid = s.user?.uid;
 h.modal("Find a taxpayer", `<div class="modal-body ops-lookup">
  <form id="ops-search"><label for="ops-query">Name or taxpayer reference</label>
   <div class="ops-search-bar"><input id="ops-query" class="input" name="query" type="search" required maxlength="90" placeholder="e.g. Sterling or URA-…" autocomplete="off">
   <button type="submit" class="button">Search</button></div>
  </form><div class="ops-search-results" data-results aria-live="polite"></div>
 </div><div class="modal-bottom"><button class="button secondary" data-close>Close</button></div>`, el => {
  el.querySelector(".modal").classList.add("ops-lookup-dialog");
  const input = el.querySelector("#ops-query");
  input.focus();
  el.querySelector("form").addEventListener("submit", async event => {
   event.preventDefault();
   const value = input.value.trim();
   if (!value) return;
   const button = event.submitter || el.querySelector('[type="submit"]');
   const list = el.querySelector("[data-results]");
   button.disabled = true;
   list.textContent = "Searching the registry…";
   try {
    const items = await registryLookup(value);
    if (!el.isConnected || s.user?.uid !== uid) return;
    list.innerHTML = items.map(row => `<button class="ops-result" type="button" data-subject="${E(row.id)}"><strong>${E(row.name)}</strong><small>${E(row.reference)} · ${E(row.type)}</small><span aria-hidden="true">›</span></button>`).join("") ||
     '<p class="ops-search-empty">No matching taxpayers. Try the first part of a name or the full reference.</p>';
    list.querySelectorAll("[data-subject]").forEach(btn => btn.addEventListener("click", () => {
     selection = btn.dataset.subject;
     el.remove();
     h.reload();
    }));
   } catch (error) { if (el.isConnected) list.textContent = serviceMessage(error); }
   finally { button.disabled = false; }
  });
 });
}
export function operationForm(h, title, fields, button, run, after, extra = "") {
 return h.modal(title, `<form class="ops-form"><div class="modal-body">${fields}<p class="c-error" role="alert"></p></div><div class="modal-bottom"><button type="button" class="button secondary" data-close>Cancel</button>${extra}<button class="button" type="submit">${E(button)}</button></div></form>`, el => {
  const form = el.querySelector("form");
  form.addEventListener("submit", async event => {
   event.preventDefault();
   const buttons = [...form.querySelectorAll('[type="submit"]')];
   buttons.forEach(btn => btn.disabled = true);
   const error = form.querySelector("[role=alert]");
   error.textContent = "";
   try {
    const result = await run(Object.fromEntries(new FormData(form)), event.submitter?.value);
    if (!el.isConnected) return;
    el.remove();
    if (after) await after(result);
    else {h.toast("Record updated."); await h.reload();}
   } catch (err) { if (el.isConnected) error.textContent = serviceMessage(err); }
   finally { buttons.forEach(btn => btn.disabled = false); }
  });
 });
}
const periodPayload = (calendar, row) => ({taxpayerId: calendar.taxpayer.id, type: row.type, year: row.year, period: row.period});
function periodStatus(row, today) {
 if (["unfiled", "draft"].includes(row.status)) {
  if ((row.extension?.status === "approved" ? row.extension.requestedUntil : row.filingDue) < today) return "Overdue";
  if (today <= row.endDate) return "Period open";
  if (row.status === "unfiled") return "Filing due";
 }
 return labels[row.status] || row.status;
}
function filingRows(calendar, businessOnly) {
 return calendar.periods.filter(row => !businessOnly || businessFields[row.type]).map(row => {
  const effective = row.extension?.status === "approved" ? row.extension.requestedUntil : row.filingDue;
  const canExtend = !row.extension && calendar.date <= row.filingDue && ["unfiled", "draft"].includes(row.status);
  const extension = row.extension ? actionButton("data-extension-info", row.id, `Extension ${row.extension.status}`) : canExtend ? actionButton("data-extend", row.id, "Request extension") : "";
  const open = !businessFields[row.type]&&row.status==="unfiled" ? `<a class="link" href="#filings/new_${E(row.year)}_${E(row.type)}_${E(calendar.taxpayer.id)}">Start return</a>` : businessFields[row.type] && ["unfiled", "draft", "information_requested", "rejected"].includes(row.status) ? actionButton("data-business-file", row.id, row.status === "unfiled" ? "Start return" : "Continue") :
   row.status !== "unfiled" ? `<a class="link" href="#filings/${E(row.id)}">View filing</a>` : "";
  const payment = row.treasuryAccountId && row.outstandingCents > 0 ? `<a class="link" href="#payments/account_${E(row.treasuryAccountId)}">Pay ${E(cash(row.outstandingCents))}</a>` : "";
  return cell(taxLabel(row.type)) + cell(periodLabel(row.type, row.year, row.period)) + cell(effective) + cell(row.paymentDue) +
   `<td><span class="ops-badge ${periodStatus(row, calendar.date) === "Overdue" ? "ops-badge-late" : row.status === "accepted" ? "ops-badge-good" : ""}">${E(periodStatus(row, calendar.date))}</span></td>` + `<td><div class="ops-actions">${open}${extension}${payment}</div></td>`;
 });
}
const reloadButton = '<button class="button secondary" type="button" data-ops-reload>Retry</button>';
function emptyState(title, detail, action = "", failed = false) {
 return `<div class="ops-state${failed ? " ops-state-error" : ""}"${failed ? ' role="status"' : ""}>
  <div><strong>${E(title)}</strong><p>${E(detail)}</p></div>${action}</div>`;
}
const unavailable = (title, error, link = "") => emptyState(title, error, `<div class="ops-actions">${link}${reloadButton}</div>`, true);
function deadlineCards(calendar) {
 const open = calendar.periods.filter(row => ["unfiled","draft","information_requested","rejected"].includes(row.status));
 const due = row => row.extension?.status === "approved" ? row.extension.requestedUntil : row.filingDue;
 const dates = open.map(due).sort();
 const next = dates.find(date => date >= calendar.date);
 return `<div class="ops-stats">
  <div><span>Open filing periods</span><strong>${open.length}</strong></div>
  <div><span>Overdue filings</span><strong>${dates.filter(date => date < calendar.date).length}</strong></div>
  <div><span>Next filing deadline</span><strong>${E(next || "—")}</strong></div>
 </div>`;
}
function calendarPage(s, data) {
 const calendar = data.calendar;
 const schedule = commissioner(s) ? '<button type="button" class="button secondary" id="ops-edit-policy">Edit filing schedule</button>' : "";
 const filings = calendar ? deadlineCards(calendar) + panel("Filing periods",
  table(["Tax", "Period", "Filing due", "Payment due", "Status", "Actions"], filingRows(calendar, false)), schedule) : "";
 if (!staff(s)) return filings;
 const extensions = data.extensions;
 const rows = (extensions?.items || []).map(row =>
  cell(row.taxpayerName) + cell(taxLabel(row.type)) + cell(periodLabel(row.type,row.year,row.period)) + cell(row.requestedUntil) +
  `<td>${actionButton("data-review-extension", row.id, supervisor(s) ? "Review" : "View")}</td>`);
 const content = data.errors.extensions ? unavailable("Extension queue unavailable", data.errors.extensions) :
  table(["Taxpayer", "Tax", "Period", "Requested until", ""], rows, "No filing extensions are awaiting review.");
 return filings + panel("Pending extensions", content,
  extensions?.next ? '<button class="button secondary" id="ops-more-extensions" type="button">More requests</button>' : "");
}
function businessPage(s, data) {
 const calendar = data.calendar;
 if (!calendar) return "";
 if (calendar.taxpayer.type !== "business") return panel("Business tax registrations",
  emptyState("A business taxpayer is required", "Sales tax and employer withholding accounts belong to registered businesses.",
   staff(s) ? '<button class="button secondary" type="button" data-ops-select>Find a business</button>' : '<a class="link" href="#calendar">Open your tax calendar</a>'));
 const open = commissioner(s) && calendar.registrations.length < 2 ? '<button class="button" id="ops-register" type="button">Open tax account</button>' : "";
 const accounts = calendar.registrations.map(row => `<article class="ops-account"><div><h3>${E(taxLabel(row.type))}</h3>
  <p>${row.type === "sales" ? "Monthly returns" : "Quarterly returns"}</p></div><span class="pill">${E(row.status)}</span>
  <small>Effective ${E(row.effectiveDate)}</small></article>`);
 return panel("Business tax registrations", accounts.length ? `<div class="ops-account-grid">${accounts.join("")}</div>` :
  emptyState("No business tax accounts", "Open a sales tax or employer withholding account to start filing."), open) +
  panel("Returns and balances", table(["Tax", "Period", "Filing due", "Payment due", "Status", "Actions"], filingRows(calendar, true), "No business filing periods are registered for this year."));
}
function wagePage(data) {
 if (!data.taxpayerId && !data.calendar && !data.statements && !data.errors.statements) return "";
 const calendar = data.calendar;
 const business = calendar?.taxpayer.type === "business";
 const rows = (data.statements?.items || []).map(row => cell(business ? row.taxpayerName : calendar ? row.employerName : row.employerName + " / " + row.taxpayerName) +
  cell(row.taxYear) + cell(cash(row.wagesCents)) + cell(cash(row.withheldCents)) + `<td>${actionButton("data-wage-print", row.id, "Print")}</td>`);
 const issue = business && calendar.registrations.some(entry => entry.type === "payroll") ? '<button class="button" id="ops-wage-issue" type="button">Issue wage statement</button>' : "";
 const more = data.statements?.next ? '<button class="button secondary" id="ops-more-wages" type="button">More statements</button>' : "";
 return panel(business ? "Issued wage statements" : calendar ? "Statements from your employers" : "Wage statements",
  (data.errors.statements ? unavailable("Wage statements unavailable", data.errors.statements) :
   table([business ? "Employee" : calendar ? "Employer" : "Employer / employee", "Tax year", "Wages", "Tax withheld", ""], rows, "No wage statements have been issued.")) + more, issue);
}
function noticesPage(s, data) {
 const records = data.requests?.items || [];
 const letter = data.detail?.notice;
 const letters = data.letters?.items || [];
 const casesLink = staff(s) ? '<a class="link" href="#examinations">Open examinations</a>' : '<a class="link" href="#appeals">Open my appeals</a>';
 const detail = letter ? panel(letter.title, `<div class="ops-letter"><p>${E(letter.caseNumber)} · ${E(letter.issuer)}</p><div class="ops-pre">${E(letter.body)}</div></div>`) :
  data.errors.detail ? panel("Selected correspondence", unavailable("Could not open this record", data.errors.detail, casesLink)) :
  data.detail && !data.detail.request ? panel("Selected correspondence", emptyState("Notice unavailable", "The notice may have been removed or may belong to another account.")) : "";
 const requestRows = records.map(row => {
  const accepted = row.items.filter(item => item.status === "accepted").length;
  return `<article class="ops-inbox-row"><div><strong>${E(row.title)}</strong><span>${E(row.caseNumber)} · Due ${E(row.due)}</span></div>
   <span class="ops-badge ${accepted === row.items.length ? "ops-badge-good" : ""}">${accepted}/${row.items.length} accepted</span>
   ${actionButton("data-request", row.id, "Open request")}</article>`;
 }).join("");
 const letterRows = letters.map(row => `<article class="ops-inbox-row"><div><strong>${E(row.title)}</strong>
  <span>${E(row.caseNumber)} · ${E(row.date?.slice(0,10) || "Date unavailable")}</span></div>
  <a class="link" href="#notices/letter_${E(row.id)}">Read notice</a></article>`).join("");
 return detail + '<div class="ops-inbox">' +
  panel("Information requests", data.errors.requests ? unavailable("Information requests unavailable", data.errors.requests, casesLink) :
   requestRows || emptyState("No information requests", "Requests from examiners will appear here when issued."),
   data.requests?.next ? '<button class="button secondary" id="ops-more-notices" type="button">More requests</button>' : "") +
  panel("Issued notices", data.errors.letters ? unavailable("Issued notices unavailable", data.errors.letters, casesLink) :
   letterRows || emptyState("No issued notices", "Agency correspondence will appear here when issued."),
   data.letters?.next ? '<button class="button secondary" id="ops-more-letters" type="button">More notices</button>' : "") + "</div>";
}
const workspaceInfo = {
 calendar: ["clock", "Review due dates and filing extensions."],
 "business-taxes": ["bank", "Manage sales tax and employer withholding."],
 "wage-statements": ["file", "Issue or review annual wage statements."],
 notices: ["receipt", "Read notices and respond to agency requests."]
};
export function operationsHTML(s, h) {
 const data = context?.page === s.page && context.uid === s.user?.uid && context.target === s.routeTarget ? context : null;
 const [icon, description] = workspaceInfo[s.page];
 const header = `<header class="ops-header"><div class="ops-header-icon">${h.icon(icon)}</div><div><h1>${E(titles[s.page])}</h1><p>${E(description)}</p></div>
  ${staff(s) && s.page !== "notices" ? '<button class="button" type="button" data-ops-select>Find taxpayer</button>' : ""}</header>`;
 if (!data) return header + panel("Workspace", emptyState(s.loading ? "Loading records…" : "Workspace unavailable", s.loading ? "Retrieving agency records." : "Retry to reconnect to the agency services.", s.loading ? "" : reloadButton));
 if (s.page === "notices") return header + noticesPage(s,data);
 const filters = data.calendar ? `<div class="ops-context"><div><span>Taxpayer</span><strong>${E(data.calendar.taxpayer.name)}</strong></div>
  <div><span>Simulation date</span><strong>${E(data.calendar.date)}</strong></div>
  ${s.page !== "wage-statements" ? `<label for="ops-year">Tax year<select class="input" id="ops-year">${options(data.calendar.years.map(value => [value, value]), year)}</select></label>` : ""}</div>` :
  data.errors.calendar ? panel("Taxpayer workspace", unavailable("Taxpayer workspace unavailable", data.errors.calendar)) :
  staff(s) ? panel("Taxpayer workspace", emptyState("Choose a taxpayer", "Search the registry by name or taxpayer reference.",
   '<button class="button secondary" type="button" data-ops-select>Find taxpayer</button>')) : "";
 return header + filters + (s.page === "calendar" ? calendarPage(s,data) : s.page === "business-taxes" ? businessPage(s,data) : wagePage(data));
}
export function openBusinessReturn(s, h, record, calendar = null) {
 const row = record;
 const type = row.type || row.returnType;
 const values = row.data || {};
 const payload = {taxpayerId: calendar?.taxpayer.id || row.taxpayerId, type, year: row.year || row.taxYear, period: row.period};
 const finish = result => { h.toast(result?.data?.status === "submitted" ? "Business tax return submitted." : "Business tax draft saved."); return h.reload(); };
 operationForm(h, `${taxLabel(type)} · ${periodLabel(type,payload.year,payload.period)}`,
  (row.decisionReason ? `<p class="tax-info">${E(row.decisionReason)}</p>` : "") +
  (businessFields[type] || []).map(([key, label]) => amountInput(key, `${label} ($)`, values[key])).join("") +
  area("explanation", "Supporting explanation", 1000, values.explanation || "", false) +
  `<label class="tax-attest"><input name="attested" type="checkbox" ${values.attested ? "checked" : ""}> I declare these fictional figures accurate.</label>`,
  "Save draft", (form, action) => call("saveBusinessTaxReturn", {...payload, data: {...form, attested: form.attested === "on"}, submit: action === "file"}), finish,
  '<button class="button" type="submit" value="file">Submit filing</button>');
}
export function openInformationRequest(h, s, record, after = null) {
 const isOwner = record.taxpayerId === s.me?.taxpayerId && (!record.ownerUid || record.ownerUid === s.user?.uid);
 const blocks = record.items.map(item => {
  const choices = item.status === "awaiting_response" && isOwner ? [["reply", "Respond"]] : item.status === "submitted" && staff(s) ? [["accept", "Accept response"], ["follow_up", "Request follow-up"]] : [];
  return `<section class="ops-request"><h3>${E(item.prompt)}</h3><p class="help">${E(textStatus(item.status))}</p>${item.thread.map(entry => `<div class="activity-row"><div><strong>${E(entry.by)} · ${E(textStatus(entry.action))}</strong><p>${E(entry.at?.slice(0,10))}</p><p class="ops-pre">${E(entry.message)}</p></div></div>`).join("")}<div class="ops-actions">${choices.map(([key,label]) => actionButton("data-answer", `${item.id}:${key}`, label)).join("")}</div></section>`;
 });
 h.modal(record.title, `<div class="modal-body"><p>${E(record.caseNumber)} · Due ${E(record.due)}</p>${blocks.join("")}</div><div class="modal-bottom"><button class="button secondary" data-close>Close</button></div>`, el => {
  el.querySelectorAll("[data-answer]").forEach(btn => btn.addEventListener("click", () => {
   const [itemId,action] = btn.dataset.answer.split(":");
   el.remove();
   operationForm(h, "Record correspondence", area("message", "Response or review note", 1600), "Save response",
    form => call("updateInformationRequest", {id:record.id,itemId,action,message:form.message}), after);
  }));
 });
}
export function createRequestDialog(h, caseId, after) {
 operationForm(h, "Request information", textInput("title", "Request title", 'required maxlength="120"') + textInput("due", "Response deadline", 'type="date" required') +
  area("items", "Requested items, one per line", 4800), "Issue request", form => call("createInformationRequest", {...form, caseId,
   items: form.items.split("\n").map(line => line.trim()).filter(Boolean)}), after);
}
function extensionDialog(h, s, row) {
 const review = row.status === "requested" && supervisor(s);
 const fields = `<p><strong>${E(row.taxpayerName)}</strong> · ${E(taxLabel(row.type))}</p><p>Requested filing date ${E(row.requestedUntil)} · Payment due ${E(row.paymentDue)}</p><p class="ops-pre">${E(row.reason)}</p>`;
 if (!review) { h.modal("Filing extension", `<div class="modal-body">${fields}<p>${E(textStatus(row.status))} ${E(row.decisionReason || "")}</p></div><div class="modal-bottom"><button class="button secondary" data-close>Close</button></div>`); return; }
 operationForm(h, "Determine filing extension", fields + select("status", "Decision", [["approved","Approve"],["denied","Deny"]]) + area("reason", "Explanation"), "Record decision", form => call("decideFilingExtension", {...form, id:row.id}));
}
export function operationsBind(s,h) {
 if (!operationsPages.includes(s.page)) return;
 document.querySelectorAll("[data-ops-select]").forEach(button => button.addEventListener("click", () => searchTaxpayer(h,s)));
 document.querySelectorAll("[data-ops-reload]").forEach(button => button.addEventListener("click", () => {
  document.querySelectorAll("[data-ops-reload]").forEach(retry => retry.disabled = true);
  h.reload();
 }));
 const data = context;
 if (!data || data.page !== s.page || data.uid !== s.user?.uid || data.target !== s.routeTarget) return;
 const calendar = data.calendar;
 const bind = (selector, fn) => document.querySelectorAll(selector).forEach(button => button.addEventListener("click", () => fn(button)));
 const auto = data.detail?.request;
 if (s.routeTarget?.startsWith("collection_") && !data.opened) {
  data.opened=true;import("./case-services.js").then(({openCollectionDetails})=>{if(context===data)openCollectionDetails(s,h,s.routeTarget.slice(11));});
 }
 if (auto && s.routeTarget === auto.id && !data.opened) {data.opened = true; openInformationRequest(h,s,auto);}
 document.getElementById("ops-year")?.addEventListener("change", event => {
  year = Number(event.currentTarget.value);
  if (s.routeTarget) location.hash = s.page;
  else h.reload();
 });
 bind("[data-business-file]", async button => {
  const row = calendar.periods.find(p => p.id === button.dataset.businessFile);
  button.disabled = true;
  try {
   const record = row.status !== "unfiled" ? (await loadCall("getTaxFiling", {returnId:row.id})).filing : null;
   if (context === data) openBusinessReturn(s,h,{...row,...record},calendar);
  } catch (error) {h.toast(error.message,true);} finally {button.disabled = false;}
 });
 bind("[data-extend]", button => {
  const row = calendar.periods.find(p => p.id === button.dataset.extend);
  operationForm(h, "Request filing extension", `<p>Original filing deadline ${E(row.filingDue)} · Payment deadline ${E(row.paymentDue)}</p>` +
   textInput("requestedUntil", "Requested filing deadline", 'type="date" required') + area("reason", "Reason for extension"), "Submit request",
   form => call("requestFilingExtension", {...periodPayload(calendar,row),...form}));
 });
 bind("[data-extension-info]", button => extensionDialog(h,s,calendar.periods.find(p => p.id === button.dataset.extensionInfo).extension));
 bind("[data-review-extension]", button => extensionDialog(h,s,data.extensions.items.find(row => row.id === button.dataset.reviewExtension)));
 bind("#ops-more-extensions", async () => {
  try {const next = await loadCall("listFilingExtensions", {cursor:data.extensions.next}); if (context === data) {data.extensions = {items:[...data.extensions.items,...next.items],next:next.next};h.renderShell();}} catch (error) {h.toast(error.message,true);}
 });
 bind("#ops-register", () => {
  const types = Object.keys(businessFields).filter(type => !calendar.registrations.some(row => row.type === type));
  if (!types.length) {h.toast("Both business tax accounts are already open."); return;}
  operationForm(h, "Open business tax account", select("type", "Account type", types.map(type => [type,taxLabel(type)])) +
   textInput("effectiveDate", "Effective date", 'type="date" required', calendar.date), "Open account",
   form => call("openBusinessTaxAccount", {...form,taxpayerId:calendar.taxpayer.id}));
 });
 bind("#ops-edit-policy", () => {
  operationForm(h,"Choose tax schedule",select("type","Tax type",calendar.policies.map(row => [row.type,taxLabel(row.type)])),"Continue", form => Promise.resolve(form.type), type => {
   const p = calendar.policies.find(row => row.type === type);
   if (p.locked) {h.toast("This schedule is locked by a filing or extension request.", true); return;}
   operationForm(h, `${taxLabel(type)} · ${p.year}`, textInput("filingDay","Filing day of month",'type="number" min="1" max="28" required',p.filingDay) +
    textInput("paymentDay","Payment day of month",'type="number" min="1" max="28" required',p.paymentDay) +
    (businessFields[type] ? textInput("rateBps","Fictional rate in basis points",'type="number" min="0" max="10000" required',p.rateBps) :
     textInput("annualMonth","Due month in the following year",'type="number" min="1" max="12" required',p.annualMonth)), "Save schedule",
    form => call("setFilingSchedule", {...form,type,year:p.year}));
  });
 });
 bind("#ops-wage-issue", () => operationForm(h,"Issue employer statement",textInput("recipientId","Employee taxpayer reference",'required maxlength="24" placeholder="URA-… or NPC-…"') +
  textInput("year","Tax year",'type="number" min="2025" max="2035" required',year) + amountInput("wages","Wages ($)") + amountInput("withheld","Withholding ($)"), "Issue statement",
  form => call("issueWageStatement", {...form,taxpayerId:calendar.taxpayer.id})));
 bind("[data-wage-print]", button => {
  const row = data.statements.items.find(item => item.id === button.dataset.wagePrint);
  printDocument({heading:"Wage & withholding statement", reference:row.id, rows:[["Employer",row.employerName],["Employee",row.taxpayerName],["Tax year",row.taxYear],["Wages",cash(row.wagesCents)],["Tax withheld",cash(row.withheldCents)]]});
 });
 bind("#ops-more-wages", async () => {
  try {const next = await loadCall("listWageStatements", {cursor:data.statements.next,taxpayerId:data.taxpayerId}); if (context === data) {data.statements = {items:[...data.statements.items,...next.items],next:next.next};h.renderShell();}} catch (error) {h.toast(error.message,true);}
 });
 bind("[data-request]", button => openInformationRequest(h,s,data.requests.items.find(row => row.id === button.dataset.request)));
 bind("#ops-more-letters",async button=>{
  button.disabled=true;
  try{const next=await loadCall("listPortalNotices",{cursor:data.letters.next});if(context===data){data.letters={items:[...data.letters.items,...next.items],next:next.next};h.renderShell();}}
  catch(error){h.toast(error.message,true);}finally{button.disabled=false;}
 });
 bind("#ops-more-notices", async () => {
  try {const next = await loadCall("listInformationRequests", {cursor:data.requests.next,openOnly:staff(s)}); if (context === data) {data.requests = {items:[...data.requests.items,...next.items],next:next.next};h.renderShell();}} catch (error) {h.toast(error.message,true);}
 });
}
