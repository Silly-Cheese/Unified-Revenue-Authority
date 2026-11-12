// Generation 6 — pure report and document presentation helpers; no Firebase dependency.
export function escapeHTML(value){
 return String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
}
export function formatCurrency(value){
 const n=Number(value??0);
 return "$"+(Number.isFinite(n)?n:0).toLocaleString("en-US",{style:"decimal",minimumFractionDigits:2,maximumFractionDigits:2});
}
export function centsText(value){return formatCurrency(Number(value||0)/100);}
export function csvEscape(value){
 let text=String(value??"");
 if(/^[\s]*[=+\-@\t\r]/.test(text))text="'"+text;
 return '"'+text.replace(/"/g,'""')+'"';
}
export function csvText(rows){
 if(!Array.isArray(rows))throw Error("CSV export requires rows.");
 return "\ufeff"+rows.map(row=>row.map(csvEscape).join(",")).join("\r\n")+"\r\n";
}
export function fileName(prefix){
 return String(prefix||"URA-record").replace(/[^A-Za-z0-9_-]/g,"_").slice(0,70);
}
export function createCSV(name,rows){
 const blob=new Blob([csvText(rows)],{type:"text/csv;charset=utf-8"});
 const href=URL.createObjectURL(blob),anchor=document.createElement("a");
 anchor.href=href;anchor.download=fileName(name)+".csv";
 document.body.append(anchor);anchor.click();anchor.remove();
 setTimeout(()=>URL.revokeObjectURL(href),1000);
}
export function printSheet({heading,subtitle,reference,rows=[],sections=[],footer,issuer}){
 const E=escapeHTML;
 const info=rows.map(([label,value])=>'<div class="field"><small>'+E(label)+'</small><strong>'+E(value)+'</strong></div>').join("");
 const blocks=sections.map(s=>'<section class="section"><h2>'+E(s.title)+'</h2>'+
 (s.rows?'<table><thead><tr>'+s.rows[0].map(h=>'<th>'+E(h)+'</th>').join("")+'</tr></thead><tbody>'+
 s.rows.slice(1).map(row=>'<tr>'+row.map(v=>'<td>'+E(v)+'</td>').join("")+'</tr>').join("")+'</tbody></table>':
 '<p>'+E(s.body||"").replace(/\n/g,"<br>")+'</p>')+'</section>').join("");
 return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
 '<title>'+E(heading)+' · URA Simulation</title><style>'+
 'body{font-family:Arial,sans-serif;color:#223249;margin:0;background:#eef1f5}*{box-sizing:border-box}.paper{background:#fff;max-width:850px;margin:28px auto;padding:46px 55px;min-height:1050px;box-shadow:0 10px 25px #17284415}'+
 '.brand{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #1d3b59;padding-bottom:20px;gap:15px}.seal{display:grid;place-items:center;border:3px double #b2935f;border-radius:50%;width:64px;height:64px;font-family:Georgia,serif;color:#997947;font-size:19px;font-weight:bold}.brand strong{font-size:17px;letter-spacing:.05em}.brand small{display:block;letter-spacing:.2em;font-size:8px;color:#8f7b5d;margin-top:7px}'+
 '.watermark{font-weight:800;letter-spacing:.16em;color:#a04f50;border:1px solid #e3c4c4;font-size:10px;padding:9px 14px;display:inline-block;margin-top:25px}h1{font-family:Georgia,serif;color:#1d3550;font-size:27px;margin:22px 0 6px}h2{font-size:13px;color:#294562;border-bottom:1px solid #dce4eb;padding-bottom:10px;margin:0 0 15px}p{line-height:1.8;color:#4d5b6b;font-size:12px}.sub{font-size:11px;color:#7f91a3}.meta{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:27px 0 34px}.field{border:1px solid #e0e6eb;padding:12px 14px;border-radius:5px}.field small{font-size:9px;display:block;color:#8292a5;margin-bottom:6px}.field strong{font-size:12px;overflow-wrap:anywhere}.section{margin-top:24px;break-inside:avoid}table{width:100%;border-collapse:collapse;font-size:10px;margin-top:10px}th{text-align:left;background:#f1f4f7;color:#4f6480;font-size:9px;text-transform:uppercase}th,td{border-bottom:1px solid #e1e6ea;padding:11px 9px;overflow-wrap:anywhere}'+
 '.signatures{display:flex;gap:30px;margin-top:55px}.sig{flex:1;border-top:1px solid #7b8694;padding-top:8px;font-size:9px;color:#758499}.foot{border-top:1px solid #dce4e9;margin-top:40px;padding-top:15px;font-size:9px;color:#929daa;line-height:1.8}.controls{display:flex;gap:10px;justify-content:center;padding:15px}.controls button{border:0;border-radius:7px;background:#1c3856;color:white;font-weight:700;padding:11px 17px;cursor:pointer}@media print{body{background:#fff}.controls{display:none}.paper{box-shadow:none;margin:0;max-width:unset;min-height:0;padding:15mm 15mm 10mm}@page{size:letter;margin:0}}</style></head><body>'+
 '<div class="controls"><button onclick="window.print()">Print / Save as PDF</button><button onclick="window.close()">Close</button></div>'+
 '<main class="paper"><header class="brand"><div><strong>UNIFIED REVENUE AUTHORITY</strong><small>INSTITUTIONAL RECORDS DIVISION</small></div><span class="seal">URA</span></header>'+
 '<div class="watermark">FICTIONAL ROLEPLAY DOCUMENT · NOT OFFICIAL GOVERNMENT CORRESPONDENCE</div>'+
 '<h1>'+E(heading)+'</h1><div class="sub">'+E(subtitle||"")+'</div><div class="meta"><div class="field"><small>Record reference</small><strong>'+E(reference||"URA-SIMULATION")+'</strong></div><div class="field"><small>Document prepared</small><strong>'+E(new Date().toLocaleString("en-US"))+'</strong></div>'+info+'</div>'+
 blocks+'<div class="signatures"><div class="sig">Authorized URA officer (roleplay)</div><div class="sig">Recipient acknowledgment (roleplay)</div></div>'+
 '<footer class="foot">'+E(footer||"This document is for roleplay and simulation use only. It has no legal, tax or financial effect.")+
 (issuer?'<div>Prepared / issued by: '+E(issuer)+'</div>':"")+'</footer></main></body></html>';
}
export function printDocument(documentSettings,existingWindow=null){
 const w=existingWindow||window.open("","_blank");
 if(!w)throw Error("Allow pop-ups for this site to open printable fictional records.");
 w.document.open();w.document.write(printSheet(documentSettings));w.document.close();
 w.focus();
}
