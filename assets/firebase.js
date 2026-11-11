import {initializeApp} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-app.js";
import {getAuth} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import {getFirestore} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";
import {getFunctions} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-functions.js";

// Firebase client settings are public identifiers, not administrator credentials.
export const firebaseConfig={
 apiKey:"AIzaSyBxwEoQQ_HHqwPDa1QArGzFTHd06WJCUqg",
 authDomain:"unified-revenue-authority.firebaseapp.com",
 projectId:"unified-revenue-authority",
 messagingSenderId:"172060567417",
 appId:"1:172060567417:web:9014553fa88304cb10b1a8"
};
export const app=initializeApp(firebaseConfig);
export const auth=getAuth(app);
export const db=getFirestore(app);
export const functions=getFunctions(app,"us-central1");