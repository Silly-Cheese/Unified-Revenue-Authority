import {dollars, ensureYear, moneyCents} from "./tax-engine.js";

export const BUSINESS_TAXES = {
 sales: {label: "Sales tax", frequency: 12, rateBps: 600, fields: {grossSales: "Gross sales", exemptSales: "Exempt sales", estimatedPayments: "Prior payments"}},
 payroll: {label: "Employer withholding", frequency: 4, rateBps: 400, fields: {grossPayroll: "Gross payroll", exemptPayroll: "Exempt payroll", taxWithheld: "Tax withheld from employees", estimatedPayments: "Prior remittances"}}
};
export const ANNUAL_TAXES = {individual: "Individual income tax", business: "Business income tax"};
export const taxLabel = type => BUSINESS_TAXES[type]?.label || ANNUAL_TAXES[type] || type;
export const todayUTC = () => new Date().toISOString().slice(0, 10);
export const isoDate = (year, month, day) => new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
export function validDate(value) {
 return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function validatePeriod(type, year, period) {
 year = ensureYear(year);
 period = Number(period);
 const frequency = BUSINESS_TAXES[type]?.frequency ?? (Object.hasOwn(ANNUAL_TAXES, type) ? 1 : 0);
 if (!Number.isInteger(period) || period < 1 || period > frequency) throw Error("Select a valid tax type and period.");
 return {year, period, frequency};
}
export function defaultSchedule(type, year) {
 return {type, year, filingDay: BUSINESS_TAXES[type] ? 20 : 15, paymentDay: BUSINESS_TAXES[type] ? 20 : 15,
  annualMonth: 4, rateBps: BUSINESS_TAXES[type]?.rateBps ?? 0};
}
export function periodDates(type, year, period, policy = defaultSchedule(type, year)) {
 const {frequency} = validatePeriod(type, year, period);
 const months = 12 / frequency;
 const nextMonth = frequency === 1 ? 12 + policy.annualMonth - 1 : period * months;
 return {startDate: isoDate(year, (period - 1) * months, 1), endDate: isoDate(year, period * months, 0),
  filingDue: isoDate(year, nextMonth, policy.filingDay), paymentDue: isoDate(year, nextMonth, policy.paymentDay)};
}
export function returnKey(taxpayerId, type, year, period = 1) {
 return `${taxpayerId}_${year}_${type}${BUSINESS_TAXES[type] ? `_P${period}` : "_original"}`;
}
export function calculateBusinessTax(type, raw, policy) {
 if (!Object.hasOwn(BUSINESS_TAXES, type)) throw Error("Unknown business tax type.");
 const form = BUSINESS_TAXES[type];
 const cents = Object.fromEntries(Object.entries(form.fields).map(([key, label]) => [key, moneyCents(raw?.[key], label)]));
 const gross = type === "sales" ? cents.grossSales : cents.grossPayroll;
 const exempt = type === "sales" ? cents.exemptSales : cents.exemptPayroll;
 if (exempt > gross) throw Error("Exempt amounts cannot exceed the gross amount.");
 const taxable = gross - exempt;
 const baseTax = Math.round(taxable * policy.rateBps / 10000);
 const taxDue = Math.max(baseTax, cents.taxWithheld ?? 0);
 const paid = cents.estimatedPayments;
 const data = Object.fromEntries(Object.entries(cents).map(([key, amount]) => [key, dollars(amount)]));
 data.explanation = String(raw?.explanation ?? "").trim().slice(0, 1000);
 data.attested = raw?.attested === true;
 return {data, calculation: {grossIncomeCents: gross, deductionsCents: exempt, taxableIncomeCents: taxable,
  baseTaxCents: baseTax, taxDueCents: taxDue, paymentsCents: paid, refundCents: Math.max(0, paid - taxDue),
  balanceCents: Math.max(0, taxDue - paid), reviewFlags: type === "payroll" && cents.taxWithheld !== baseTax ?
   ["Reported withholding differs from the calculated amount."] : []}};
}
export function installmentProgress(plan, date) {
 let cumulative = 0;
 return (plan.schedule || []).map(line => {
  const paidCents = Math.min(line.amountCents, Math.max(0, (plan.paidCents || 0) - cumulative));
  cumulative += line.amountCents;
  const remainingCents = line.amountCents - paidCents;
  return {...line, paidCents, remainingCents, status: remainingCents === 0 ? "paid" : line.dueDate < date ? "overdue" : "upcoming"};
 });
}
