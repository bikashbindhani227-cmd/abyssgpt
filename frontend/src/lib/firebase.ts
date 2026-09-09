import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
  updateProfile,
  onAuthStateChanged,
  type User as FirebaseUser
} from 'firebase/auth';

// Default config from generated firebase-applet-config.json
let firebaseConfig = {
  projectId: "gen-lang-client-0076726116",
  appId: "1:132244538729:web:99127c443b06f350e5e9f8",
  apiKey: "AIzaSyAha953rjCLc3PAS93jlr_lSWYyH3ifbVI",
  authDomain: "gen-lang-client-0076726116.firebaseapp.com",
  firestoreDatabaseId: "ai-studio-aichatbot-a86fc9cc-6999-4a0d-86d6-d6318f7c93e2",
  storageBucket: "gen-lang-client-0076726116.firebasestorage.app",
  messagingSenderId: "132244538729",
};

// Override with environment variables if present
if (import.meta.env.VITE_FIREBASE_API_KEY) {
  firebaseConfig = {
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || firebaseConfig.projectId,
    appId: import.meta.env.VITE_FIREBASE_APP_ID || firebaseConfig.appId,
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY || firebaseConfig.apiKey,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || firebaseConfig.authDomain,
    firestoreDatabaseId: import.meta.env.VITE_FIREBASE_DATABASE_ID || firebaseConfig.firestoreDatabaseId,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || firebaseConfig.storageBucket,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || firebaseConfig.messagingSenderId,
  };
}

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export {
  app,
  auth,
  googleProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  firebaseSignOut,
  sendPasswordResetEmail,
  updateProfile,
  onAuthStateChanged,
  type FirebaseUser
};
