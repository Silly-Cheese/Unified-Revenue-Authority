import test from "node:test";
import assert from "node:assert/strict";
import {escapeHTML,csvText,centsText,printSheet,fileName} from "../../assets/documents.js";

test("user-controlled text is escaped in HTML document templates",()=>{
 assert.equal(escapeHTML('<script src="bad">&"</script>'),'&lt;script src=&quot;bad&quot;&gt;&amp;&quot;&lt;/script&gt;');
 const html=printSheet({heading:"Fiscal <script>alert(1)</script>",
  subtitle:"Customer <b>Record</b>",reference:"URA-1",
  sections:[{title:"Findings",body:"User-provided <img src=x onerror=alert(1)>"}]});
 assert.ok(html.includes("&lt;script&gt;"));
 assert.ok(html.includes("&lt;img"));
 assert.ok(!html.includes("<img src=x"));
 assert.match(html,/FICTIONAL ROLEPLAY DOCUMENT/);
 assert.match(html,/NOT OFFICIAL GOVERNMENT CORRESPONDENCE/);
});
test("CSV encoding blocks spreadsheet formula injection and quotes correctly",()=>{
 const csv=csvText([["taxpayer","amount"],["=1+1","250.00"],["Jordan, Vale",'quoted "value"']]);
 assert.ok(csv.includes('"\'=1+1"'));
 assert.ok(csv.includes('"Jordan, Vale"'));
 assert.ok(csv.includes('"quoted ""value"""'));
 assert.equal(csv.startsWith("\ufeff"),true);
});
test("record names and financial currency are formatted safely",()=>{
 assert.equal(centsText(105),"$1.05");
 assert.equal(fileName("../TRADE:REPORT?.pdf"),"___TRADE_REPORT__pdf");
});
