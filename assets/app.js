import {auth,db} from "./firebase.js";
import {taxPages,taxPageHTML,taxPageBind,taxLoad,resetTaxWorkspace} from "./tax.js";
import {treasuryPages,treasuryPageHTML,treasuryPageBind,treasuryLoad} from "./treasury.js";
import {casePages,casePageHTML,casePageBind,caseLoad} from "./cases.js";
import {simulationPages,simulationPageHTML,simulationPageBind,simulationLoad} from "./simulation.js";
import {openPasswordChange,openPortalActivation,openPortalReset,portalStatus} from "./portal.js";
import {operationsPages,operationsLoad,operationsHTML,operationsBind,resetOperations,selectOperationsTaxpayer} from "./operations.js";
import {centsText} from "./documents.js";
import {enterprisePages,enterprisePageHTML,enterprisePageBind,enterpriseLoad} from "./enterprise.js";
import {authListener,profile,register,login,logout,call} from "./auth.js";
import {collection,getDocs,query,orderBy,limit} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";

const app=document.getElementById("app");
const state={user:null,me:null,authMode:"login",authBusy:false,page:"dashboard",routeTarget:"",loading:false,overview:null,portalOverview:null,taxpayers:[],users:[],events:[],search:"",menu:false};
const paths={
 landmark:'<path d="m3 10 9-6 9 6M4 10h16M6 10v9M10 10v9M14 10v9M18 10v9M3 21h18"/>',
 grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
 users:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM16 4a4 4 0 0 1 0 8M22 21v-2a4 4 0 0 0-3-3.87"/>',
 file:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h8"/>',
 bank:'<path d="M3 10h18M5 10v10m5-10v10m4-10v10m5-10v10M2 21h20M12 2 2 8h20z"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 3"/>',
 shield:'<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4"/>',
 receipt:'<path d="M4 3h16v18l-4-2-4 2-4-2-4 2zM8 8h8M8 12h8"/>',
 chart:'<path d="M3 3v18h18M7 16v-4m5 4V7m5 9V9"/>',
 settings:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a2 2 0 0 0 .4 2.2l-1.8 1.8a2 2 0 0 0-2.2-.4l-1 .4a2 2 0 0 0-1.3 1.8H10.5A2 2 0 0 0 9.2 19l-1-.4a2 2 0 0 0-2.2.4l-1.8-1.8A2 2 0 0 0 4.6 15l-.4-1a2 2 0 0 0-1.8-1.3v-2.6A2 2 0 0 0 4.2 8.8l.4-1a2 2 0 0 0-.4-2.2L6 3.8a2 2 0 0 0 2.2.4l1-.4A2 2 0 0 0 10.5 2h3a2 2 0 0 0 1.3 1.8l1 .4a2 2 0 0 0 2.2-.4l1.8 1.8a2 2 0 0 0-.4 2.2l.4 1a2 2 0 0 0 1.8 1.3v2.6a2 2 0 0 0-1.8 1.3z"/>',
 search:'<circle cx="10.5" cy="10.5" r="7"/><path d="m16 16 5 5"/>',
 plus:'<path d="M12 5v14M5 12h14"/>',
 chevron:'<path d="m9 18 6-6-6-6"/>',
 logout:'<path d="M10 17l5-5-5-5m5 5H3M13 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6"/>',
 menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
 close:'<path d="M5 5l14 14M19 5 5 19"/>',
 activity:'<path d="M3 12h4l3-7 4 14 3-7h4"/>',
 wallet:'<rect x="2" y="5" width="20" height="16" rx="2"/><path d="M2 9h20M16 15h2"/>',
 layers:'<rect x="3" y="3" width="18" height="5" rx="1"/><rect x="3" y="10" width="18" height="5" rx="1"/><rect x="3" y="17" width="18" height="5" rx="1"/>',
 check:'<path d="m5 12 4 4L19 6"/>',
 info:'<circle cx="12" cy="12" r="10"/><path d="M12 11v6M12 7h.01"/>'
};
function icon(name){return '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">'+(paths[name]||paths.file)+'</svg>';}
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function initials(name){return String(name||"U").split(" ").slice(0,2).map(w=>w[0]||"").join("").toUpperCase();}
function roleLabel(r){return ({commissioner:"Commissioner of Revenue",supervisor:"Division Supervisor",staff:"Revenue Officer",auditor:"Examination Officer",citizen:"Registered Taxpayer"})[r]||"Citizen";}
function isStaff(){return state.me&&state.me.role!=="citizen";}
function isCommissioner(){return state.me?.role==="commissioner";}
function formatDate(ts){try{if(!ts)return "—";return new Date(ts.toDate?ts.toDate():ts).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"});}catch{return "—";}}
function toast(message,bad=false){document.querySelector(".toast")?.remove();const el=document.createElement("div");el.className="toast"+(bad?" bad":"");el.textContent=message;document.body.append(el);setTimeout(()=>el.remove(),4200);}
function authError(e){const raw=e?.code||"";if(raw.includes("email-already-in-use"))return "An account already uses this name. Please sign in or choose another fictional name.";if(raw.includes("invalid-credential")||raw.includes("wrong-password")||raw.includes("user-not-found"))return "Incorrect name or password.";if(raw.includes("too-many-requests"))return "Too many attempts. Try again later.";if(raw.includes("network-request-failed"))return "Network unavailable. Check your internet connection.";return e?.message||"Something went wrong. Please try again.";}
function renderAuth(err=""){
 resetTaxWorkspace();
 resetOperations();
 document.querySelectorAll(".modal-backdrop,#global-command").forEach(node=>node.remove());
 app.innerHTML='<div class="auth-shell"><section class="auth-cover"><div class="brand"><span class="seal">'+icon("landmark")+'</span><span>UNIFIED<br>REVENUE AUTHORITY</span></div><div><div class="eyebrow">The nation’s financial administration</div><h1>Precision in every <em>decision.</em></h1><p class="auth-copy">A complete fictional revenue institution—taxpayer services, agency operations, treasury administration, and financial accountability.</p></div><div class="auth-foot">OFFICIAL RP SIMULATION · NO REAL TAX OR FINANCIAL SERVICES</div></section><section class="auth-side"><div class="auth-card"><div class="eyebrow" style="color:#a48655;margin-bottom:14px">Secure agency access</div><h2>'+(state.authMode==="login"?"Welcome back":"Establish your account")+'</h2><p>'+(state.authMode==="login"?"Sign in to your secure roleplay account.":"Register a fictional identity. No real email address is required.")+'</p><div class="switch"><button type="button" data-mode="login" class="'+(state.authMode==="login"?"active":"")+'">Sign in</button><button type="button" data-mode="register" class="'+(state.authMode==="register"?"active":"")+'">Create account</button></div><form id="auth-form"><div class="field"><label for="fullName">Full character name</label><input id="fullName" class="input" autocomplete="username" required maxlength="60" placeholder="e.g., Jordan Vale"></div><div class="field"><label for="password">Password</label><input id="password" class="input" type="password" required minlength="'+(state.authMode==="register"?"10":"1")+'" autocomplete="'+(state.authMode==="register"?"new-password":"current-password")+'" placeholder="Enter your password"></div>'+(state.authMode==="register"?'<div class="field"><label for="confirm">Confirm password</label><input id="confirm" class="input" type="password" required minlength="10" autocomplete="new-password" placeholder="Re-enter your password"></div>':'')+'<div id="form-message">'+(err?'<div class="error">'+esc(err)+'</div>':"")+'</div><button type="submit" class="button full" id="auth-submit">'+(state.authMode==="login"?"Access your account":"Create roleplay account")+'</button></form><div class="notice"> '+icon("shield")+' <strong>Roleplay accounts:</strong> Your chosen name and password are your login credentials. No email verification or real personal information is necessary. Password recovery requires an agency administrator.</div><div class="mini-footer">Unified Revenue Authority · Fictional government simulation</div></div></section></div>';
 document.querySelectorAll("[data-mode]").forEach(el=>el.addEventListener("click",()=>{state.authMode=el.dataset.mode;renderAuth();}));
 document.getElementById("auth-form").addEventListener("submit",async event=>{
 event.preventDefault();if(state.authBusy)return;const name=document.getElementById("fullName").value;const pass=document.getElementById("password").value;
 if(state.authMode==="register"&&pass!==document.getElementById("confirm").value){document.getElementById("form-message").innerHTML='<div class="error">Passwords do not match.</div>';return;}
 state.authBusy=true;document.getElementById("auth-submit").disabled=true;
 try{
  if(state.authMode==="register")await register(name,pass);else await login(name,pass);
  state.user=auth.currentUser;state.me=await profile(state.user.uid);
  state.portalOverview=null;
  if(!state.me)throw Error("Account profile not found. Please contact the agency administrator.");
  await enter();
 }catch(e){renderAuth(authError(e));}finally{state.authBusy=false;}
 });
}
const adminNav=[["dashboard","grid","Command center"],["executive","chart","Executive intelligence"],["registry","users","Enterprise registry"],["taxpayers","users","Taxpayer registry"],["filings","file","Tax filings"],["processing","search","Return processing"],["assessments","receipt","Assessments"],["treasury","bank","Treasury"],["payments","wallet","Payments"],["refunds","receipt","Refunds"],["plans","clock","Payment plans"],["ledger","chart","General ledger"],["examinations","search","Examinations"],["appeals","file","Administrative appeals"],["collections","wallet","Collections"],["investigations","shield","Investigations"],["simulation","layers","Simulation command"],["documents","file","Document Studio"],["modules","layers","Agency divisions"],["activity","activity","Activity & audit"],["account","settings","My account"]];
function visiblePages(){
 const pages=isStaff()?[...adminNav]:[["dashboard","grid","My overview"],["filings","file","Tax filings"],["assessments","receipt","Assessments"],["treasury","bank","My treasury"],["payments","wallet","Payments"],["refunds","receipt","Refunds"],["plans","clock","Payment plans"],["appeals","file","My appeals"],["dossier","users","My tax dossier"],["documents","file","Document Studio"],["account","settings","My account"]];
 pages.splice(isStaff()?6:2,0,["business-taxes","bank","Business tax accounts"],["calendar","clock","Tax calendar"],["wage-statements","file","Wage statements"],["notices","file","Notices & responses"]);
 if(isCommissioner()){pages.splice(2,0,["staff","shield","Personnel & roles"]);pages.push(["taxpolicy","settings","Tax policy"]);}
 if(state.me?.role==="staff"){const i=pages.findIndex(p=>p[0]==="investigations");if(i!==-1)pages.splice(i,1);}
 return pages;
}
function sidebar(){
 const pages=visiblePages();
 return '<aside class="sidebar'+(state.menu?" open":"")+'"><div class="brand"><span class="seal">'+icon("landmark")+'</span><span>UNIFIED REVENUE<br>AUTHORITY</span></div><div class="sidebar-section">Agency workspace</div><nav class="nav">'+pages.map(p=>'<a href="#'+p[0]+'" class="'+(state.page===p[0]?"active":"")+'">'+icon(p[1])+esc(p[2])+'</a>').join("")+'</nav><div class="sidebar-bottom"><div class="identity"><div class="avatar">'+esc(initials(state.me?.displayName))+'</div><div><div class="who">'+esc(state.me?.displayName)+'</div><div class="role">'+esc(roleLabel(state.me?.role))+'</div></div></div><button class="button ghost" id="logout" style="margin-top:15px;color:#cad8e5;width:100%">'+icon("logout")+' Sign out</button></div></aside>';
}
function pageHeader(title,sub,action=""){return '<div class="page-head"><div><div class="eyebrow" style="color:#aa8959">UNIFIED REVENUE AUTHORITY / OPERATIONS</div><h1>'+esc(title)+'</h1><p>'+esc(sub)+'</p></div>'+action+'</div>';}
function kpi(label,value,foot,ico){return '<div class="kpi"><div class="kpi-label">'+esc(label)+icon(ico)+'</div><div class="kpi-value">'+esc(value)+'</div><div class="kpi-foot">'+esc(foot)+'</div></div>';}
function renderShell(){
 if(!state.me){renderAuth();return;}
 const title={dashboard:"Command center",taxpayers:"Taxpayer registry",staff:"Personnel management",activity:"Activity & audit",account:"My account",modules:"Agency divisions",filings:"Tax filings",processing:"Return processing",assessments:"Tax assessments",taxpolicy:"Tax policies",treasury:"Treasury command",payments:"Payments & receipts",refunds:"Refund operations",plans:"Payment arrangements",ledger:"General ledger",examinations:"Examinations & audits",appeals:"Administrative appeals",collections:"Revenue collections",investigations:"Special investigations",simulation:"Simulation command",executive:"Executive intelligence",registry:"Enterprise registry",dossier:"Taxpayer dossier",documents:"Document Studio"}[state.page]||visiblePages().find(page=>page[0]===state.page)?.[2]||"Operations";
 app.innerHTML='<div class="shell">'+sidebar()+(state.menu?'<div class="sidebar-shade" id="shade"></div>':"")+'<div class="workspace"><header class="topbar"><div class="crumb"><button class="mobile-toggle" id="mobile-menu" aria-label="Open navigation">'+icon("menu")+'</button><span>URA</span>'+icon("chevron")+' <strong>'+esc(title)+'</strong></div><div class="top-actions"><button class="e-global-find" id="global-search" type="button" aria-label="Find a module (Control K)">'+icon("search")+' <span class="label">Find a module</span><kbd>Ctrl K</kbd></button><span class="pill">Simulation environment</span><span class="label">'+esc(state.me.displayName)+'</span><span class="avatar" style="width:32px;height:32px">'+esc(initials(state.me.displayName))+'</span></div></header><main class="content">'+pageHTML()+'<div class="mini-footer">UNIFIED REVENUE AUTHORITY · FICTIONAL GOVERNMENT ROLEPLAY</div></main></div></div>';
 document.getElementById("logout").addEventListener("click",async()=>{await logout();state.user=null;state.me=null;state.portalOverview=null;state.actionCenter=null;state.overview=null;state.treasuryOverview=null;state.workload=null;state.events=[];state.page="dashboard";renderAuth();});
 document.getElementById("global-search")?.addEventListener("click",showCommandPalette);
 document.getElementById("mobile-menu")?.addEventListener("click",()=>{state.menu=!state.menu;renderShell();});
 document.getElementById("shade")?.addEventListener("click",()=>{state.menu=false;renderShell();});
 document.querySelectorAll(".nav a").forEach(a=>a.addEventListener("click",()=>{state.menu=false;}));
 bindPage();
}
function pageHTML(){
 if(operationsPages.includes(state.page))return operationsHTML(state,{pageHeader,icon,modal,toast,renderShell,reload:loadPage,state});
 if(taxPages.includes(state.page))return taxPageHTML(state,{pageHeader,icon,modal,toast,renderShell,reload:loadPage,state});
 if(treasuryPages.includes(state.page))return treasuryPageHTML(state,{pageHeader,icon,modal,toast,renderShell,reload:loadPage,state});
 if(casePages.includes(state.page))return casePageHTML(state,{pageHeader,icon,modal,toast,renderShell,reload:loadPage,state});
 if(simulationPages.includes(state.page))return simulationPageHTML(state,{pageHeader,icon,modal,toast,renderShell,reload:loadPage,state});
 if(enterprisePages.includes(state.page))return enterprisePageHTML(state,{pageHeader,icon,modal,toast,renderShell,reload:loadPage,state});
 if(state.page==="taxpayers"&&isStaff())return taxpayersPage();
 if(state.page==="staff"&&isCommissioner())return staffPage();
 if(state.page==="activity"&&isStaff())return activityPage();
 if(state.page==="account")return accountPage();
 if(state.page==="modules"&&isStaff())return modulesPage();
 return dashboardPage();
}
function dashboardPage(){
 if(!isStaff())return citizenDashboard();
 const summary=state.overview||{};
 const treasury=state.treasuryOverview;
 const workload=state.workload;
 const pending=treasury ? Number(treasury.pendingRefunds || 0) : "—";
 return pageHeader("Agency command center","Review the agency’s current workload and Treasury position.")+
 '<div class="kpis">'+kpi("Registered taxpayers",String(summary.taxpayers??"—"),"Live agency registry","users")+
 kpi("Treasury cash",treasury?centsText(treasury.chart?.[1000]?.balanceCents||0):"—","Net simulated cash balance","bank")+
 kpi("Returns awaiting review",String(summary.pendingReturns??"—"),"Submitted returns","file")+
 kpi("Refund requests",String(pending),"Awaiting authorization","receipt")+'</div>'+
 '<div class="grid-two"><section class="card card-pad"><div class="section-head"><h2>Agency work queue</h2></div><div class="t-actions">'+
 '<a class="t-action" href="#processing"><strong>Return processing</strong><small>'+esc(summary.pendingReturns??"—")+' submitted returns</small></a>'+
 '<a class="t-action" href="#refunds"><strong>Refund operations</strong><small>'+esc(pending)+' pending requests</small></a>'+
 '<a class="t-action" href="#examinations/overdue"><strong>Overdue cases</strong><small>'+esc(workload?.overdue??"—")+' across the agency</small></a>'+
 '<a class="t-action" href="#registry"><strong>Taxpayer registry</strong><small>Find a taxpayer and open their dossier</small></a></div></section>'+
 '<section class="card card-pad"><div class="section-head"><h2>Recent agency activity</h2></div>'+recentEvents(4)+'</section></div>';
}
function citizenDashboard(){
 const overview=state.portalOverview;
 const detailText=state.loading?"Loading Treasury balances…":"Treasury balances unavailable";
 return pageHeader("Your taxpayer portal","Manage your filings, balances, and agency correspondence.")+
 '<div class="stat-strip"><div><h2>Welcome, '+esc(state.me.displayName)+'</h2>'+
 (overview?'<p>'+esc(overview.fullName)+' · '+esc(overview.taxpayerNumber)+'</p>':"")+
 '</div><a class="button" href="#dossier">Open my tax dossier</a></div>'+
 '<div class="kpis">'+
 kpi("Outstanding taxes",overview?centsText(overview.outstandingCents):"—",overview?"Total across your tax accounts":detailText,"wallet")+
 kpi("Refunds paid",overview?centsText(overview.refundsDisbursedCents):"—",overview?"Total disbursed by the Treasury":detailText,"receipt")+
 '</div>'+citizenActions()+'<section class="card card-pad"><div class="section-head"><h2>Portal services</h2></div>'+
 '<div class="t-actions"><a href="#filings" class="t-action"><strong>Tax filings</strong><small>Start a return or track an existing filing</small></a>'+
 '<a href="#treasury" class="t-action"><strong>My Treasury</strong><small>Review balances and payment activity</small></a>'+
 '<a href="#refunds" class="t-action"><strong>Refunds</strong><small>Request a refund or check its status</small></a>'+
 '<a href="#appeals" class="t-action"><strong>My appeals</strong><small>View cases and correspondence</small></a></div></section>';
}
function citizenActions(){
 const center=state.actionCenter;
 if(!center)return '<section class="card card-pad ops-panel"><h2>Action center</h2><p class="help">'+(state.loading?"Loading taxpayer tasks…":"Taxpayer tasks are temporarily unavailable.")+'</p></section>';
 return '<section class="card card-pad ops-panel"><div class="section-head"><h2>Action center</h2><span class="pill gray">'+center.items.length+' updates</span></div>'+
 (center.items.length?'<div class="ops-request-list">'+center.items.map(item=>'<a class="t-action" href="#'+esc(item.route)+'"><strong>'+esc(item.title)+'</strong><small>'+esc(item.detail)+(item.due?' · Due '+esc(item.due):'')+'</small></a>').join("")+'</div>':'<p class="help">You have no open tasks or recent decisions.</p>')+'</section>';
}
function recentEvents(n=20){
 return (state.events?.length?state.events.slice(0,n).map(e=>'<div class="activity-row"><div class="activity-dot">'+icon("activity")+'</div><div><strong>'+esc(e.action||"Agency event")+'</strong><p>'+esc(e.detail||"Recorded activity")+'</p><p>'+esc(formatDate(e.createdAt))+'</p></div></div>').join(""):'<div class="empty">'+icon("clock")+'<div>No activity recorded yet.<br>Actions will appear here as your agency operates.</div></div>');
}
function taxpayersPage(){
 return pageHeader("Taxpayer registry","Create, locate, and review fictional taxpayer records.",'<button class="button" id="newTaxpayer">'+icon("plus")+' Register taxpayer</button>')+
 '<div class="toolbar"><input class="input" id="searchTax" value="'+esc(state.search)+'" placeholder="Search taxpayer, login, reference or region" aria-label="Search taxpayers"><span class="pill gray">'+state.taxpayers.length+' recent records</span><a class="link" href="#registry">Browse full registry</a></div>'+
 '<div class="card card-pad"><div class="section-head"><h2>Registry entries</h2></div><div class="table-wrap"><table class="table"><thead><tr><th>Taxpayer</th><th>Reference</th><th>Type</th><th>Region</th><th>Status</th><th>Portal access</th><th></th></tr></thead><tbody id="taxpayer-rows">'+filteredTaxRows()+'</tbody></table></div></div>';
}
function staffPage(){
 const users=state.users||[];
 return pageHeader("Personnel & access","Manage staff assignments and authority with role-based controls.")+
 '<div class="alert" style="margin-bottom:20px"><strong>Access management:</strong> Only the founding Commissioner may change employee roles. An account must be created by its owner before it can receive staff access. Commissioner privileges cannot be granted from this screen.</div>'+
 '<div class="card card-pad"><div class="section-head"><h2>Registered accounts</h2><span class="pill gray">'+users.length+' shown</span></div><div class="table-wrap"><table class="table"><thead><tr><th>Account name</th><th>Current role</th><th>Joined</th><th>Assign role</th></tr></thead><tbody>'+
 (users.length?users.map(u=>'<tr><td class="name">'+esc(u.displayName)+'</td><td><span class="pill '+(u.role==="commissioner"?"gold":"gray")+'">'+esc(roleLabel(u.role))+'</span></td><td>'+esc(formatDate(u.createdAt))+'</td><td>'+(u.role==="commissioner"?"Protected":'<select class="input" style="padding:8px;min-height:34px" data-role-uid="'+esc(u.id)+'">'+["citizen","staff","auditor","supervisor"].map(r=>'<option value="'+r+'" '+(r===u.role?"selected":"")+'>'+esc(roleLabel(r))+'</option>').join("")+'</select>')+'</td></tr>').join(""):'<tr><td colspan="4"><div class="empty">No registered accounts found.</div></td></tr>')+'</tbody></table></div></div>';
}
function activityPage(){
 return pageHeader("Agency activity & audit","An append-only operational record of key administrative events.")+'<div class="card card-pad"><div class="section-head"><h2>Operational events</h2><span class="pill gray">Newest first</span></div>'+recentEvents(50)+'</div>';
}
function detail(k,v){return '<div class="detail-item"><div class="small">'+esc(k)+'</div><div class="big">'+esc(v)+'</div></div>';}
function accountPage(){
 return pageHeader("My account","Manage your URA sign-in and view your agency role.")+
 '<div class="grid-two"><div class="card card-pad"><div class="section-head"><h2>Account information</h2></div><div class="detail-grid">'+
 detail("Portal login name",state.me.displayName)+detail("Agency role",roleLabel(state.me.role))+detail("Account created",formatDate(state.me.createdAt))+detail("Access status",state.me.status||"active")+
 '</div></div><div class="card card-pad"><div class="section-head"><h2>Password & sign-in</h2></div>'+
 '<p class="help">Use your fictional login name and password to sign in. If you forget the password, contact the agency administrator.</p>'+
 '<div class="p-controls"><button class="button secondary" id="accountSignout">'+icon("logout")+' Sign out</button><button class="button" id="accountPassword">Change password</button></div></div></div>';
}
const modules=[
 ["Taxpayer registration","users","Active","Identity registry, account profiles and fictional taxpayer records."],
 ["Personnel administration","shield","Active","Role-controlled employee access and Commissioner management."],
 ["Tax return processing","file","Active","Multi-step individual and business filings with calculation rules."],
 ["Tax assessment","receipt","Active","Versioned tax policy, assessments and amended filings."],
 ["Treasury & accounting","bank","Active","Double-entry simulated financial transactions and reconciliation."],
 ["Payments & refunds","wallet","Active","Simulated payments, refunds and authorization chains."],
 ["Examination & audit","search","Active","Case investigation, document requests and determination workflow."],
 ["Appeals & collections","activity","Active","Administrative appeals, balances, and installment agreements."],
 ["Simulation engine","layers","Active","Generated fictional taxpayers, businesses, events and workload."],
 ["Executive intelligence","chart","Active","Agency analytics, reports, controls and advanced administration."]
];
function modulesPage(){return pageHeader("Agency divisions","A connected institutional platform, delivered in six planned generations.")+'<div class="module-grid">'+modules.map(m=>'<div class="card module"><div class="module-icon">'+icon(m[1])+'</div><h3>'+esc(m[0])+'</h3><p>'+esc(m[3])+'</p><div class="lock">'+esc(m[2])+'</div></div>').join("")+'</div>';}
function modal(title,body,onBind){
 const el=document.createElement("div");el.className="modal-backdrop";el.innerHTML='<section class="modal" role="dialog" aria-modal="true" aria-label="'+esc(title)+'"><div class="modal-top"><h2>'+esc(title)+'</h2><button class="icon-button" data-close aria-label="Close">'+icon("close")+'</button></div>'+body+'</section>';document.body.append(el);el.querySelectorAll("[data-close]").forEach(b=>b.addEventListener("click",()=>el.remove()));el.addEventListener("click",e=>{if(e.target===el)el.remove();});onBind?.(el);return el;
}
function newTaxpayer(){
 modal("Register fictional taxpayer",'<form id="tax-form"><div class="modal-body"><div class="field"><label>Full name or business name</label><input class="input" name="fullName" required minlength="3" maxlength="90" placeholder="Fictional taxpayer name"></div><div class="field"><label>Taxpayer classification</label><select class="input" name="type"><option value="individual">Individual</option><option value="business">Business</option></select></div><div class="field"><label>Administrative region</label><select class="input" name="region"><option>Capital District</option><option>Northern Region</option><option>Southern Region</option><option>Eastern Region</option><option>Western Region</option></select></div><div class="field"><label>Internal notes (optional)</label><textarea class="input" name="notes" rows="3" maxlength="500" placeholder="Fictional record details"></textarea></div><div class="alert">All records in this platform are fictional. Do not enter real tax identifiers or sensitive personal information.</div><div id="tax-error"></div></div><div class="modal-bottom"><button class="button secondary" type="button" data-close>Cancel</button><button class="button" type="submit">Create record</button></div></form>',el=>{
  el.querySelector("#tax-form").addEventListener("submit",async e=>{
  e.preventDefault();const form=e.target;const btn=form.querySelector('[type="submit"]');btn.disabled=true;
  try{const data=Object.fromEntries(new FormData(form));await call("createTaxpayer",data);el.remove();toast("Taxpayer record registered.");await loadPage();}catch(err){el.querySelector("#tax-error").innerHTML='<div class="error">'+esc(authError(err))+'</div>';}finally{btn.disabled=false;}
  });
 });
}
function viewTaxpayer(id){
 const t=state.taxpayers.find(x=>x.id===id);if(!t)return;
 const status=portalStatus(t);
 const activate=isCommissioner()&&status==="Ready to convert";
 const reset=isCommissioner()&&status==="Portal linked"&&t.status==="active"&&t.portalName;
 modal("Taxpayer record",'<div class="modal-body"><div class="detail-grid">'+detail("Name",t.fullName)+detail("Taxpayer reference",t.taxpayerNumber||t.id)+detail("Classification",t.type)+detail("Region",t.region)+detail("Status",t.status||"active")+detail("Portal access",status)+(t.portalName?detail("Portal login name",t.portalName):"")+detail("Created",formatDate(t.createdAt))+'</div><div class="alert" style="margin-top:17px">'+esc(t.notes||"No internal notes provided.")+'</div></div><div class="modal-bottom">'+
 (t.type==="business"?'<button class="button secondary" id="openBusinessTax">Business tax accounts</button>':"")+
 (activate?'<button class="button" id="activateTaxPortal">Create portal login</button>':"")+
 (reset?'<button class="button" id="resetTaxPortal">Reset portal password</button>':"")+
 (isCommissioner()&&t.status!=="archived"&&!t.ownerUid?'<button class="button danger" id="archiveTax">Archive record</button>':"")+
 '<button class="button secondary" data-close>Close</button></div>',el=>{
 const handlers={modal,toast,reload:loadPage,authError};
 el.querySelector("#openBusinessTax")?.addEventListener("click",()=>{el.remove();selectOperationsTaxpayer(t.id);location.hash="business-taxes";});
 el.querySelector("#activateTaxPortal")?.addEventListener("click",()=>{
  el.remove();
  openPortalActivation(t,handlers);
 });
 el.querySelector("#resetTaxPortal")?.addEventListener("click",()=>{
  el.remove();
  openPortalReset(t,handlers);
 });
 el.querySelector("#archiveTax")?.addEventListener("click",async()=>{
 if(!confirm("Archive this taxpayer record? Archived records remain in the audit history."))return;
 try{await call("archiveTaxpayer",{id:t.id});el.remove();toast("Taxpayer archived.");await loadPage();}catch(e){toast(authError(e),true);}
 });
 });
}
function bindPage(){
 taxPageBind(state,{pageHeader,icon,modal,toast,renderShell,reload:loadPage,state});
 treasuryPageBind(state,{pageHeader,icon,modal,toast,renderShell,reload:loadPage,state});
 casePageBind(state,{pageHeader,icon,modal,toast,renderShell,reload:loadPage,state});
 simulationPageBind(state,{pageHeader,icon,modal,toast,renderShell,reload:loadPage,state});
 enterprisePageBind(state,{pageHeader,icon,modal,toast,renderShell,reload:loadPage,state});
 operationsBind(state,{pageHeader,icon,modal,toast,renderShell,reload:loadPage,state});
 document.getElementById("newTaxpayer")?.addEventListener("click",newTaxpayer);
 document.getElementById("accountSignout")?.addEventListener("click",()=>logout());
 document.getElementById("accountPassword")?.addEventListener("click",()=>openPasswordChange({modal,toast,authError}));
 document.getElementById("searchTax")?.addEventListener("input",e=>{state.search=e.target.value;document.getElementById("taxpayer-rows").innerHTML=filteredTaxRows();wireTaxButtons();});
 wireTaxButtons();
 document.querySelectorAll("[data-role-uid]").forEach(select=>select.addEventListener("change",async e=>{
 const uid=e.target.dataset.roleUid,role=e.target.value;select.disabled=true;
 try{await call("assignRole",{uid,role});toast("Role updated.");await loadPage();}catch(err){toast(authError(err),true);await loadPage();}
 }));
}
function filteredTaxRows(){
 const q=state.search.toLowerCase();
 const arr=state.taxpayers.filter(t=>[t.fullName,t.portalName,t.taxpayerNumber,t.id,t.region].join(" ").toLowerCase().includes(q));
 return arr.length?arr.map(t=>'<tr><td class="name">'+esc(t.fullName)+'</td><td>'+esc(t.taxpayerNumber||t.id)+'</td><td>'+esc(t.type)+'</td><td>'+esc(t.region||"—")+'</td><td><span class="pill '+(t.status==="archived"?"gray":"")+'">'+esc(t.status||"active")+'</span></td><td>'+esc(portalStatus(t))+(t.portalName?'<div class="tax-sub">'+esc(t.portalName)+'</div>':"")+'</td><td><button class="link" data-view-tax="'+esc(t.id)+'">View</button></td></tr>').join(""):'<tr><td colspan="7"><div class="empty">No matching taxpayers in the recent records.</div></td></tr>';
}
function wireTaxButtons(){document.querySelectorAll("[data-view-tax]").forEach(b=>b.addEventListener("click",()=>viewTaxpayer(b.dataset.viewTax)));}
let loadNumber=0;
async function loadPage(){
 if(!state.user||!state.me)return;
 const load=++loadNumber,uid=state.user.uid;
 state.loading=true;
 try{
  const jobs=[];
  if(isStaff()){
   // Avoid loading the command-center aggregate on unrelated pages.
   // This prevents a failing overview request from masking enterprise/registry results.
   if(state.page==="dashboard"){
    state.overview=null;state.treasuryOverview=null;state.workload=null;
    jobs.push(call("getOverview").then(r=>{if(load===loadNumber&&state.user?.uid===uid)state.overview=r.data;}),
     call("getTreasuryOverview").then(r=>{if(load===loadNumber&&state.user?.uid===uid)state.treasuryOverview=r.data;}),
     call("getAgencyWorkload").then(r=>{if(load===loadNumber&&state.user?.uid===uid)state.workload=r.data;}));
   }
   if(state.page==="dashboard"||state.page==="activity")
    jobs.push(getDocs(query(collection(db,"auditLogs"),orderBy("createdAt","desc"),limit(25))).then(s=>{if(load===loadNumber&&state.user?.uid===uid)state.events=s.docs.map(d=>({id:d.id,...d.data()}));}));
   if(state.page==="taxpayers")
    jobs.push(getDocs(query(collection(db,"taxpayers"),orderBy("createdAt","desc"),limit(200))).then(s=>{if(load===loadNumber&&state.user?.uid===uid)state.taxpayers=s.docs.map(d=>({id:d.id,...d.data()}));}));
   if(state.page==="staff"&&isCommissioner())
    jobs.push(getDocs(query(collection(db,"users"),orderBy("createdAt","desc"),limit(100))).then(s=>{if(load===loadNumber&&state.user?.uid===uid)state.users=s.docs.map(d=>({id:d.id,...d.data()}));}));
  }
  if(state.page==="dashboard"&&!isStaff()){
   const uid=state.user.uid;
   state.portalOverview=null;state.actionCenter=null;
   jobs.push(call("getTaxpayerActionCenter").then(r=>{if(load===loadNumber&&state.user?.uid===uid)state.actionCenter=r.data;}));
   jobs.push(call("getTaxpayerPortalOverview").then(r=>{
    if(state.user?.uid===uid)state.portalOverview=r.data;
   }));
  }
  if(taxPages.includes(state.page))jobs.push(taxLoad(state));
  if(treasuryPages.includes(state.page))jobs.push(treasuryLoad(state));
  if(casePages.includes(state.page))jobs.push(caseLoad(state));
  if(simulationPages.includes(state.page))jobs.push(simulationLoad(state));
  if(enterprisePages.includes(state.page))jobs.push(enterpriseLoad(state));
  if(operationsPages.includes(state.page))jobs.push(operationsLoad(state));
  const results=await Promise.allSettled(jobs);
  const failed=results.find(result=>result.status==="rejected");
  if(failed&&load===loadNumber&&state.user?.uid===uid)toast("Could not load all agency records: "+authError(failed.reason),true);
 }finally{if(load===loadNumber&&state.user?.uid===uid){state.loading=false;renderShell();}}
}
async function enter(){
 const [page,target=""]=(location.hash||"#dashboard").slice(1).split("/");
 state.page=page;
 state.routeTarget=/^[A-Za-z0-9_-]{1,150}$/.test(target)?target:"";
 if(!visiblePages().some(row=>row[0]===page)&&!(page==="dossier"&&isStaff())){state.page="dashboard";state.routeTarget="";}
 if(state.page==="taxpolicy"&&!isCommissioner())state.page="dashboard";
 if(state.page==="ledger"&&!isStaff())state.page="dashboard";
 if(["executive","registry"].includes(state.page)&&!isStaff())state.page="dashboard";
 if(["examinations","collections","investigations"].includes(state.page)&&!isStaff())state.page="dashboard";
 if(state.page==="investigations"&&!["auditor","supervisor","commissioner"].includes(state.me?.role))state.page="dashboard";
 state.loading=true;renderShell();await loadPage();
}

function showCommandPalette(){
 if(!state.me)return;
 document.getElementById("global-command")?.remove();
 const overlay=document.createElement("div");
 overlay.id="global-command";
 overlay.className="e-command-backdrop";
 overlay.innerHTML='<section class="e-command" role="dialog" aria-modal="true" aria-label="Find a URA module">'+
 '<div class="e-command-head">'+icon("search")+'<input id="command-input" type="search" placeholder="Search agency departments or actions" autocomplete="off" aria-label="Search modules">'+
 '<button type="button" id="command-close" aria-label="Close command menu">ESC</button></div>'+
 '<div class="e-command-items" id="command-items"></div>'+
 '<div class="e-command-foot">Select a department to navigate · Ctrl / ⌘ + K to open · Escape to close</div></section>';
 document.body.append(overlay);
 const inp=overlay.querySelector("#command-input"),results=overlay.querySelector("#command-items");
 const close=()=>overlay.remove();
 const nav=(key)=>{close();location.hash="#"+key;};
 function render(filter=""){
  const words=filter.toLowerCase().trim();
  const matches=visiblePages().filter(p=>(p[2]+" "+p[0]).toLowerCase().includes(words));
  results.innerHTML=matches.length?matches.map(p=>
   '<button type="button" data-command="'+esc(p[0])+'">'+icon(p[1])+
   '<span>'+esc(p[2])+'<small>Agency module · '+esc(p[0])+'</small></span></button>').join(""):
   '<div class="empty">No modules match your search. Try a department name.</div>';
  results.querySelectorAll("[data-command]").forEach(button=>button.addEventListener("click",()=>nav(button.dataset.command)));
 }
 render();inp.focus();
 inp.addEventListener("input",()=>render(inp.value));
 inp.addEventListener("keydown",ev=>{if(ev.key==="Enter"){ev.preventDefault();const first=results.querySelector("[data-command]");if(first)nav(first.dataset.command);}});
 overlay.querySelector("#command-close").addEventListener("click",close);
 overlay.addEventListener("click",ev=>{if(ev.target===overlay)close();});
}
document.addEventListener("keydown",ev=>{
 if((ev.ctrlKey||ev.metaKey)&&String(ev.key).toLowerCase()==="k"){
  ev.preventDefault();
  if(document.getElementById("global-command"))document.getElementById("command-input")?.focus();
  else showCommandPalette();
 }else if(ev.key==="Escape"){document.getElementById("global-command")?.remove();}
});

window.addEventListener("hashchange",()=>{if(state.me){state.page=(location.hash||"#dashboard").slice(1);state.menu=false;enter();}});
authListener(async user=>{
 if(state.authBusy)return;
 state.user=user;
 state.portalOverview=null;state.actionCenter=null;state.overview=null;state.workload=null;state.treasuryOverview=null;state.events=[];
 if(!user){state.me=null;renderAuth();return;}
 try{
  const account=await profile(user.uid);
  if(state.user?.uid!==user.uid)return;
  state.me=account;
  if(!state.me){renderAuth("Your account setup is incomplete. Contact an administrator.");return;}
  if(state.me.status==="suspended"){await logout();renderAuth("This account is suspended.");return;}
  await enter();
 }catch(e){renderAuth(authError(e));}
});
