// Generation 5 — premium interactive fictional-world simulation console.
import {call} from "./auth.js";
export const simulationPages=["simulation"];
const E=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const num=x=>Number(x||0).toLocaleString("en-US");
const usd=c=>"$"+(Number(c||0)/100).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
const when=value=>{if(!value)return "—";const d=new Date(value);return Number.isFinite(d.valueOf())?d.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}):"—";};
const seasons={
 steady:["Stable economy","Predictable income and business activity"],
 expansion:["Growing economy","Higher business receipts and wage activity"],
 recession:["Contracting economy","Lower simulated incomes and business sales"],
 volatile:["Volatile economy","Greater variability in fictional financial reports"]
};
const modes={
 standard:["Standard filing cycle","Common income sources and normal tax reporting"],
 complex:["Complex return batch","More deductions, business expenses and secondary income"],
 discrepancies:["Examination workload","Deliberately unusual financial statements and review flags"]
};
const scenarioLabels={
 audit_sweep:"Audit examination sweep",
 collection_cycle:"Outstanding balance cases",
 appeal_wave:"Administrative appeal wave",
 refund_review:"Refund requests review"
};
let model=null;
let peopleSearch="";
let workSearch="";
const staff=s=>s.me&&s.me.role!=="citizen";
const commissioner=s=>s.me?.role==="commissioner";
const headline=(label,value,desc)=>'<div class="sim-metric"><span>'+E(label)+'</span><strong>'+E(value)+'</strong><small>'+E(desc)+'</small></div>';
const selectChoices=(choices,selected)=>choices.map(([v,l])=>'<option value="'+E(v)+'" '+(String(v)===String(selected)?"selected":"")+'>'+E(l)+'</option>').join("");
const table=(heads,rows,none)=>rows.length?'<div class="table-wrap"><table class="table"><thead><tr>'+
 heads.map(h=>'<th>'+E(h)+'</th>').join("")+'</tr></thead><tbody>'+rows.join("")+'</tbody></table></div>':
 '<div class="sim-empty"><div class="sim-empty-icon">URA</div><strong>No records yet</strong><p>'+E(none)+'</p></div>';
const panel=(title,desc,body)=>'<section class="card sim-panel"><div class="sim-panel-head"><div><h2>'+E(title)+'</h2><p>'+E(desc)+'</p></div></div>'+body+'</section>';
const metricRow=(data)=>'<div class="sim-metrics">'+
 headline("Fictional taxpayer population",num(data.metrics?.taxpayers),"Registered synthetic identities")+
 headline("Generated tax filings",num(data.metrics?.returns),"Awaiting examiner processing")+
 headline("Scenario workload",num(data.state?.scenarioCount),"RP cases and refund requests")+
 headline("Simulation period",data.state?.currentDate||"—","Controllable fictional date")+'</div>';
function eventCards(events){
 return events.length?'<div class="sim-events">'+events.slice(0,9).map((ev,i)=>
  '<div class="sim-event"><div class="sim-event-marker">'+(ev.kind==="clock"?"◷":ev.kind==="population"?"◎":"◆")+
  '</div><div class="sim-event-text"><strong>'+E(ev.headline||ev.kind)+'</strong><p>'+E(ev.description||"")+
  '</p><small>'+E(ev.simulatedDate||"")+' · '+when(ev.createdAt)+'</small></div></div>').join("")+'</div>':
 '<div class="sim-empty"><strong>No simulation activity</strong><p>Generate fictional people or advance the clock to begin the institutional timeline.</p></div>';
}
function runHistory(items){
 return items.length?'<div class="sim-run-list">'+items.slice(0,8).map(r=>
 '<div class="sim-run"><div><strong>'+E(r.kind==="population"?"Population & filing batch":r.kind==="scenario"?"Workload scenario":"Clock advancement")+
 '</strong><small>'+E(r.kind==="population"?r.total+" taxpayers · "+r.mode:r.kind==="scenario"?
 r.total+" cases · "+r.scenario:r.fromDate+" → "+r.toDate)+'</small></div><span>'+when(r.createdAt)+'</span></div>').join("")+'</div>':
 '<div class="sim-empty"><strong>No activity recorded</strong><p>Run a simulation action to create a permanent RP history entry.</p></div>';
}
function populationTable(data){
 const rows=(data.population||[]).filter(p=>(p.name+" "+p.region+" "+p.type+" "+p.industry).toLowerCase().includes(peopleSearch.toLowerCase()))
 .slice(0,80).map(p=>'<tr><td><strong>'+E(p.name)+'</strong><small>'+E(p.industry||"Fictional resident")+'</small></td>'+
 '<td>'+E(p.type)+'</td><td>'+E(p.region)+'</td><td>'+E(p.taxYear)+'</td><td><span class="sim-tag">'+E(p.scenarioMode)+'</span></td></tr>');
 return '<div class="sim-table-search"><input id="sim-people-search" class="input" value="'+E(peopleSearch)+'" placeholder="Search fictional taxpayers" aria-label="Search generated population">'+
 '<span>Latest 80 records</span></div>'+table(["RP taxpayer","Classification","District","Tax year","Filing mode"],rows,
 "Population generation will produce fictional individuals and businesses with linked submitted tax returns.");
}
function controls(data,s){
 if(!commissioner(s))return '<div class="sim-viewer"><div class="sim-lock-icon">◆</div><h3>Operations monitoring access</h3><p>You can inspect simulated economic activity and case-generation history. Only the founding Commissioner can create populations, change economic settings, or advance the simulation clock.</p></div>';
 const current=data.state;
 const basic='<div class="sim-actions-grid">'+
 '<form id="sim-create-population" class="sim-control"><div class="sim-control-head"><div class="sim-numeral">01</div><div><h3>Populate the tax authority</h3><p>Create realistic fictional taxpayers with automatically submitted tax returns.</p></div></div>'+
 '<div class="sim-form-grid"><label>Individual taxpayers<input class="input" type="number" name="individuals" value="4" min="0" max="12" required></label>'+
 '<label>Registered businesses<input class="input" type="number" name="businesses" value="2" min="0" max="12" required></label></div>'+
 '<label class="sim-label">Filing complexity<select class="input" name="mode">'+selectChoices(Object.entries(modes).map(([k,v])=>[k,v[0]]),"standard")+'</select></label>'+
 '<div class="sim-hint">Maximum 12 new fictional returns per run. Submitted returns appear in the existing examination queue and must be reviewed before Treasury accounts are created.</div>'+
 '<button class="button" type="submit">Generate taxpayer batch</button></form>'+
 '<form id="sim-run-scenario" class="sim-control"><div class="sim-control-head"><div class="sim-numeral">02</div><div><h3>Generate agency workloads</h3><p>Open new audit, collections, appeals or refund records for assessed NPC accounts.</p></div></div>'+
 '<label class="sim-label">Scenario template<select class="input" name="scenario">'+selectChoices(Object.entries(scenarioLabels),"audit_sweep")+'</select></label>'+
 '<label class="sim-label">Number of case files<select class="input" name="count">'+selectChoices([1,2,3,4,5,6].map(x=>[x,String(x)+" case"+(x===1?"":"s")]),3)+'</select></label>'+
 '<div class="sim-hint">Requires previously generated NPC returns accepted by an examiner. Does not automatically approve any tax return or transfer funds.</div>'+
 '<button class="button secondary" type="submit">Generate case workload</button></form>'+
 '<form id="sim-advance-clock" class="sim-control"><div class="sim-control-head"><div class="sim-numeral">03</div><div><h3>Advance simulation time</h3><p>Move the fiscal calendar and record controlled fictional economic events.</p></div></div>'+
 '<label class="sim-label">Advance time<select class="input" name="days">'+selectChoices([[1,"1 simulated day"],[7,"1 simulated week"],[30,"30 simulated days"],[90,"90 simulated days"]],7)+'</select></label>'+
 '<div class="sim-clock-value"><small>Current simulated date</small><strong>'+E(current.currentDate)+'</strong></div>'+
 '<div class="sim-hint">The calendar only advances when you initiate it. No background running or automatic funds movement.</div>'+
 '<button class="button secondary" type="submit">Advance the fiscal calendar</button></form></div>';
 const settings='<form id="sim-settings" class="sim-settings"><div><h3>Economic model settings</h3><p>Conditions influence future generated fictional wages, business receipts, and anomalies.</p></div>'+
 '<label>Economic climate<select class="input" name="economy">'+selectChoices(Object.entries(seasons).map(([v,c])=>[v,c[0]]),current.economy)+'</select></label>'+
 '<label>Deterministic world seed<input class="input" type="number" name="seed" min="1" max="2147483647" step="1" required value="'+E(current.seed)+'"></label>'+
 '<button class="button secondary" type="submit">Save simulation settings</button></form>';
 return basic+settings;
}
export async function simulationLoad(state){
 if(!simulationPages.includes(state.page))return;
 if(!staff(state))return;
 model=(await call("getSimulationOverview")).data;
}
export function simulationPageHTML(s,h){
 if(!staff(s))return h.pageHeader("Agency access required","Simulation operations are restricted to agency personnel.");
 const data=model||{state:{initialized:false,currentDate:"2026-11-01",economy:"steady",seed:73011},metrics:{taxpayers:0,returns:0},events:[],population:[],runs:[]};
 const config=data.state||{},ready=Boolean(config.initialized);
 return h.pageHeader("National simulation command","Operate a persistent, fictional taxpayer economy and generate casework across the Unified Revenue Authority.")+
 '<div class="sim-hero"><div class="sim-hero-copy"><div class="sim-eyebrow">UNITED REVENUE AUTHORITY / SIMULATION OPERATIONS</div>'+
 '<h2>An entire nation, inside your agency.</h2><p>Run tax seasons, build a fictional population, and generate institutional workloads that connect directly to filing, examinations, Treasury, and appeals.</p>'+
 '<div class="sim-hero-meta"><span class="sim-dot"></span> '+(ready?"Simulation initialized":"Awaiting initial setup")+
 ' <span class="sim-divider">•</span> '+E(seasons[config.economy]?.[0]||"Stable economy")+'</div></div>'+
 '<div class="sim-hero-seal">URA<span>WORLD ENGINE</span></div></div>'+
 metricRow(data)+
 (!ready?'<section class="card sim-intro"><div class="sim-intro-badge">FOUNDATION SETUP</div><h2>Initialize the roleplay economy</h2><p>This creates the fictional world calendar and secure simulation control record. It will not create citizens or move any money until you explicitly run a batch.</p>'+
 (commissioner(s)?'<button id="sim-initialize" class="button">Initialize the simulation</button>':'<div class="sim-hint">The Commissioner must initialize the simulation before staff can view generated workloads.</div>')+'</section>':
 '<div class="sim-page-subtitle"><h2>Simulation operations</h2><span>Manual, controlled and audited</span></div>'+controls(data,s)+
 '<div class="sim-grid"><div>'+panel("Economic activity","Recent generated events and calendar updates",eventCards(data.events||[]))+'</div>'+
 '<div>'+panel("Simulation runs","Population, workload and time-control history",runHistory(data.runs||[]))+'</div></div>'+
 panel("Fictional taxpayer registry","Synthetic identities are isolated from player accounts; staff can examine their generated filings.",populationTable(data)))+
 '<p class="tax-disclaimer">ROLEPLAY SIMULATION ONLY · ALL IDENTITIES, FIRMS, WAGES, TAXES AND GOVERNMENT EVENTS ARE FICTIONAL · NO REAL FINANCIAL ACTIVITY</p>';
}
function bindForm(id,s,h,fn){
 const form=document.getElementById(id);
 if(!form)return;
 form.addEventListener("submit",async ev=>{
  ev.preventDefault();
  const button=form.querySelector('[type="submit"]');
  if(button?.disabled)return;
  if(button)button.disabled=true;
  const old=button?.textContent;
  if(button)button.textContent="Processing simulation…";
  try{
   const data=Object.fromEntries(new FormData(form));
   const result=await fn(data);
   h.toast(result?.message||"Simulation operation completed.");
   await h.reload();
  }catch(error){h.toast(error?.message||"Simulation operation failed.",true);}
  finally{if(button){button.disabled=false;button.textContent=old;}}
 });
}
export function simulationPageBind(s,h){
 if(!simulationPages.includes(s.page)||!staff(s))return;
 document.getElementById("sim-people-search")?.addEventListener("change",ev=>{peopleSearch=ev.target.value;h.renderShell();});
 if(!commissioner(s))return;
 document.getElementById("sim-initialize")?.addEventListener("click",async ev=>{
  const button=ev.currentTarget;button.disabled=true;
  try{
   await call("initializeSimulation");
   h.toast("Fictional simulation initialized.");
   await h.reload();
  }catch(error){h.toast(error?.message||"Could not initialize the simulation.",true);}
  finally{button.disabled=false;}
 });
 bindForm("sim-create-population",s,h,async d=>{
  const individuals=Number(d.individuals),businesses=Number(d.businesses);
  if(individuals+businesses<1||individuals+businesses>12)throw Error("Choose between 1 and 12 fictional taxpayers per batch.");
  if(!window.confirm("Generate "+(individuals+businesses)+" fictional taxpayers and submit their simulation returns for examiner review?"))return {message:"Generation cancelled."};
  const r=await call("generateSimulationPopulation",{individuals,businesses,mode:d.mode});
  return {message:r.data.generated+" NPC returns submitted. "+r.data.flagged+" flagged for review."};
 });
 bindForm("sim-run-scenario",s,h,async d=>{
  const r=await call("runSimulationScenario",{scenario:d.scenario,count:Number(d.count)});
  return {message:r.data.created?String(r.data.created)+" new case files created.":r.data.reason};
 });
 bindForm("sim-advance-clock",s,h,async d=>{
  const r=await call("advanceSimulationClock",{days:Number(d.days)});
  return {message:"Simulation clock advanced to "+r.data.toDate+"."};
 });
 bindForm("sim-settings",s,h,async d=>{
  await call("configureSimulation",{economy:d.economy,seed:Number(d.seed)});
  return {message:"Economic configuration updated."};
 });
}
