import {getFirestore, FieldValue} from "firebase-admin/firestore";
import {HttpsError} from "firebase-functions/v2/https";
import {canAccessTaxpayerRecord} from "./portal-access.js";
import {todayUTC} from "./filing-calendar.js";

export const db = () => getFirestore();
export const callable = {cors: true, invoker: "public"};
export const staffRoles = ["commissioner", "supervisor", "staff", "auditor"];
export const supervisorRoles = ["commissioner", "supervisor"];
export const auditorRoles = ["commissioner", "supervisor", "auditor"];
export const isStaff = user => staffRoles.includes(user.role);
export const fail = (code, message) => {throw new HttpsError(code, message);};
export const timestamp = () => FieldValue.serverTimestamp();
export const time = value => value?.toDate?.()?.toISOString() ?? null;
export async function activeUser(request) {
 const uid = request.auth?.uid;
 if (!uid) fail("unauthenticated", "Sign in before continuing.");
 const profile = (await db().collection("users").doc(uid).get()).data();
 if (profile?.status !== "active") fail("permission-denied", "An active account is required.");
 return {...profile, uid};
}
export function permit(user, roles) {
 if (!roles.includes(user.role)) fail("permission-denied", "Your agency role cannot perform this action.");
}
export function assertOwnership(user, record) {
 if (!isStaff(user) && !canAccessTaxpayerRecord(user, record)) fail("permission-denied", "This record belongs to another taxpayer.");
}
export function recordId(raw) {
 if (typeof raw !== "string" || !/^[A-Za-z0-9_-]{8,150}$/.test(raw)) fail("invalid-argument", "Enter a valid record reference.");
 return raw;
}
export function taxpayerId(raw) {
 if (typeof raw !== "string" || !/^[A-Za-z0-9]{20}$/.test(raw)) fail("invalid-argument", "Enter a valid taxpayer reference.");
 return raw;
}
export function requiredText(raw, label, min = 5, max = 1500) {
 if (typeof raw !== "string" || raw.trim().length < min || raw.trim().length > max)
  fail("invalid-argument", `${label} must contain ${min}–${max} characters.`);
 return raw.trim();
}
export async function simulationDate(tx = null) {
 const ref = db().collection("system").doc("simulation");
 const state = (await (tx ? tx.get(ref) : ref.get())).data();
 return state?.initialized ? state.currentDate : todayUTC();
}
export function audit(tx, user, action, detail, targetId) {
 tx.create(db().collection("auditLogs").doc(), {actorUid: user.uid, actorName: user.displayName, action, detail,
  targetId, createdAt: timestamp()});
}
