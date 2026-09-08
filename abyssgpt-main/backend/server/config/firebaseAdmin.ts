import { initializeApp, getApps, cert, type App } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import dotenv from 'dotenv';
dotenv.config();

const projectId = process.env.FIREBASE_PROJECT_ID || 'gen-lang-client-0076726116';
const databaseId = process.env.FIREBASE_DATABASE_ID || 'ai-studio-aichatbot-a86fc9cc-6999-4a0d-86d6-d6318f7c93e2';

let adminApp: App;

const existingApps = getApps();

if (!existingApps.length) {
  const privateKey = process.env.FIREBASE_PRIVATE_KEY
    ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    : undefined;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;

  if (privateKey && clientEmail) {
    adminApp = initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
      projectId,
    });
  } else {
    // Application Default Credentials (ADC) in Google Cloud Run / AI Studio environment
    try {
      adminApp = initializeApp({
        projectId,
      });
    } catch {
      adminApp = initializeApp();
    }
  }
} else {
  adminApp = existingApps[0]!;
}

export const adminAuth = getAuth(adminApp);
export const adminDb = databaseId && databaseId !== '(default)'
  ? getFirestore(adminApp, databaseId)
  : getFirestore(adminApp);

export default adminApp;
