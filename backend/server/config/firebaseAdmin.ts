import { initializeApp, getApps, cert, type App } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import dotenv from 'dotenv';
dotenv.config();

const projectId = process.env.FIREBASE_PROJECT_ID || 'gen-lang-client-0076726116';
const TARGET_DATABASE_ID = 'ai-studio-aichatbot-a86fc9cc-6999-4a0d-86d6-d6318f7c93e2';
const rawDatabaseId = String(process.env.FIREBASE_DATABASE_ID || '').trim();
const databaseId = rawDatabaseId && rawDatabaseId !== '(default)'
  ? rawDatabaseId
  : TARGET_DATABASE_ID;

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
export const adminDb = getFirestore(adminApp, databaseId);

export async function ensureFirebaseAuthSettings(): Promise<void> {
  try {
    const token = await adminApp.options.credential?.getAccessToken();
    if (!token?.access_token) return;

    const res = await fetch(`https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId}/config`, {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    if (!res.ok) return;

    const currentConfig = (await res.json()) as { authorizedDomains?: string[]; signIn?: { email?: { enabled?: boolean } } };
    const currentDomains = currentConfig.authorizedDomains || [];
    const isEmailEnabled = Boolean(currentConfig.signIn?.email?.enabled);

    const neededDomains = [
      'localhost',
      '127.0.0.1',
      'aistudio.google.com',
      'ais-dev-jphxoaf2o67kfyqei35fqs-117387196377.asia-southeast1.run.app',
      'ais-pre-jphxoaf2o67kfyqei35fqs-117387196377.asia-southeast1.run.app',
      'ais-shared-jphxoaf2o67kfyqei35fqs-117387196377.asia-southeast1.run.app',
      'ais-mob-jphxoaf2o67kfyqei35fqs-117387196377.asia-southeast1.run.app',
    ];

    const missingDomains = neededDomains.filter((d) => !currentDomains.includes(d));

    if (!isEmailEnabled || missingDomains.length > 0) {
      const mergedDomains = Array.from(new Set([...currentDomains, ...neededDomains]));
      await fetch(
        `https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId}/config?updateMask=authorizedDomains,signIn.email.enabled`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            authorizedDomains: mergedDomains,
            signIn: {
              email: {
                enabled: true,
                passwordRequired: true,
              },
            },
          }),
        }
      );
      console.log('Firebase Auth config successfully validated and updated.');
    }
  } catch (err) {
    console.warn('Could not auto-verify Firebase Auth config:', err);
  }
}

export default adminApp;
