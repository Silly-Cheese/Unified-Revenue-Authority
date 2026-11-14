export function unavailableService(error) {
 return ["functions/internal", "functions/unavailable", "functions/deadline-exceeded"].includes(error?.code) ||
  /^internal(?:\s*\[0\])?$/i.test(error?.message || "");
}

export function serviceMessage(error) {
 if (unavailableService(error)) return "The Firebase service did not respond. Retry, or check the Functions deployment if the problem persists.";
 if (error?.code?.endsWith("/permission-denied")) return "Your account does not have access to this service.";
 return error?.message || "The request could not be completed. Try again.";
}
