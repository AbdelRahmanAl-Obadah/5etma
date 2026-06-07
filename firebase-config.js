// =====================================================
// firebase-config.js
// =====================================================

const firebaseConfig = {
  apiKey: "AIzaSyBk-GrOTmMupNxRuVQXLCFBSRUjlOklHDU",
  authDomain: "mama-6826d.firebaseapp.com",
  projectId: "mama-6826d",
  storageBucket: "mama-6826d.firebasestorage.app",
  messagingSenderId: "52526435415",
  appId: "1:52526435415:web:COMPLETE_THIS_FROM_FIREBASE"
};

// تهيئة Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// المجموعات
const MEMBERS_COLLECTION = "members";
const SETTINGS_COLLECTION = "settings";
const SETTINGS_DOC = "general";

// كلمة مرور الأدمن (غيّرها!)
const ADMIN_PIN = "1234";