import { persistentStorage } from './storage.js';
import { adminDb } from '../config/firebaseAdmin.js';
import { getAppLimitsConfig } from './configService.js';
import type { UserProfile } from '../../types.js';

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'admin@example.com').toLowerCase();
const hasServiceAccount = Boolean(process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL);
const usersCollection = () => adminDb.collection('users');

async function firestoreUser(uid: string): Promise<UserProfile | null> {
  if (!hasServiceAccount) return null;
  try {
    const snap = await usersCollection().doc(uid).get();
    return snap.exists ? (snap.data() as UserProfile) : null;
  } catch (err) {
    console.warn('Could not read user from Firestore, falling back to local cache:', err);
    return null;
  }
}

function cacheUser(user: UserProfile) {
  persistentStorage.saveUser(user);
  return user;
}

export async function getOrCreateUser(decodedToken: { uid: string; email?: string; name?: string; picture?: string }): Promise<UserProfile> {
  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  const limitsConfig = await getAppLimitsConfig();

  let user = await firestoreUser(decodedToken.uid);
  if (!user) user = persistentStorage.getUser(decodedToken.uid);

  if (!user) {
    user = {
      uid: decodedToken.uid,
      email: decodedToken.email || '',
      displayName: decodedToken.name || decodedToken.email?.split('@')[0] || 'User',
      photoURL: decodedToken.picture || '',
      plan: 'free',
      isAdmin: Boolean(decodedToken.email && decodedToken.email.toLowerCase() === ADMIN_EMAIL),
      isBanned: false,
      dailyMessageLimit: limitsConfig.free.dailyMessageLimit,
      dailyMessageCount: 0,
      lastUsageDate: today,
      rateLimitPerMinute: limitsConfig.free.rateLimitPerMinute,
      premiumExpiresAt: null,
      customDailyMessageLimit: null,
      customRateLimitPerMinute: null,
      createdAt: now,
      updatedAt: now,
      lastActiveAt: now,
    };
    cacheUser(user);
    if (hasServiceAccount) await usersCollection().doc(user.uid).set(user, { merge: true });
    return user;
  }

  let changed = false;
  const updates: Partial<UserProfile> = { lastActiveAt: now };
  if (!user.isAdmin && decodedToken.email?.toLowerCase() === ADMIN_EMAIL) { updates.isAdmin = true; changed = true; }
  if (user.plan === 'premium' && user.premiumExpiresAt && new Date(user.premiumExpiresAt).getTime() <= Date.now()) { updates.plan = 'free'; updates.premiumExpiresAt = null; changed = true; }
  if (user.lastUsageDate !== today) { updates.dailyMessageCount = 0; updates.lastUsageDate = today; changed = true; }
  if (decodedToken.name && decodedToken.name !== user.displayName) { updates.displayName = decodedToken.name; changed = true; }
  if (decodedToken.picture && decodedToken.picture !== user.photoURL) { updates.photoURL = decodedToken.picture; changed = true; }

  const updated = { ...user, ...updates, updatedAt: now };
  cacheUser(updated);
  if (hasServiceAccount && (changed || updates.lastActiveAt)) await usersCollection().doc(user.uid).set(updates, { merge: true });
  return updated;
}

export async function getUserById(uid: string): Promise<UserProfile | null> {
  const remote = await firestoreUser(uid);
  if (remote) { cacheUser(remote); return remote; }
  return persistentStorage.getUser(uid);
}

export async function getAllUsers(): Promise<UserProfile[]> {
  if (hasServiceAccount) {
    const snap = await usersCollection().get();
    const users = snap.docs.map((d) => d.data() as UserProfile);
    users.forEach(cacheUser);
    return users;
  }
  return persistentStorage.getAllUsers();
}

export function calculateEffectiveLimits(user: UserProfile, limitsConfig: { free:{dailyMessageLimit:number;rateLimitPerMinute:number;contextLimit:number}; premium:{dailyMessageLimit:number;rateLimitPerMinute:number;contextLimit:number} }) {
  const planLimits = user.plan === 'premium' ? limitsConfig.premium : limitsConfig.free;
  return {
    dailyLimit: user.customDailyMessageLimit ?? planLimits.dailyMessageLimit,
    rateLimit: user.customRateLimitPerMinute ?? planLimits.rateLimitPerMinute,
    contextLimit: planLimits.contextLimit,
  };
}

export async function verifyAndIncrementDailyUsage(uid: string) {
  const limitsConfig = await getAppLimitsConfig();
  const today = new Date().toISOString().slice(0, 10);
  if (hasServiceAccount) {
    return adminDb.runTransaction(async (tx) => {
      const ref = usersCollection().doc(uid);
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error('User not found');
      const user = snap.data() as UserProfile;
      if (user.isBanned) return { allowed:false, count:user.dailyMessageCount, limit:0, reason:'Account is banned' };
      const effective = calculateEffectiveLimits(user, limitsConfig);
      const count = user.lastUsageDate === today ? user.dailyMessageCount : 0;
      if (count >= effective.dailyLimit) return { allowed:false, count, limit:effective.dailyLimit, reason:`Daily message limit reached (${count}/${effective.dailyLimit}).` };
      const newCount = count + 1;
      tx.set(ref, { dailyMessageCount:newCount, lastUsageDate:today, lastActiveAt:new Date().toISOString(), updatedAt:new Date().toISOString() }, { merge:true });
      const updated = { ...user, dailyMessageCount:newCount, lastUsageDate:today };
      cacheUser(updated);
      return { allowed:true, count:newCount, limit:effective.dailyLimit };
    });
  }
  const user = persistentStorage.getUser(uid);
  if (!user) throw new Error('User not found');
  if (user.isBanned) return { allowed:false, count:user.dailyMessageCount, limit:0, reason:'Account is banned' };
  const effective = calculateEffectiveLimits(user, limitsConfig);
  const count = user.lastUsageDate === today ? user.dailyMessageCount : 0;
  if (count >= effective.dailyLimit) return { allowed:false, count, limit:effective.dailyLimit, reason:`Daily message limit reached (${count}/${effective.dailyLimit}).` };
  const updated = persistentStorage.updateUser(uid, { dailyMessageCount:count + 1, lastUsageDate:today, lastActiveAt:new Date().toISOString() })!;
  return { allowed:true, count:updated.dailyMessageCount, limit:effective.dailyLimit };
}

async function updateUser(uid:string, updates:Partial<UserProfile>):Promise<UserProfile>{
  const current = await getUserById(uid);
  if (!current) throw new Error('User not found');
  const updated: UserProfile = { ...current, ...updates, updatedAt:new Date().toISOString() };
  cacheUser(updated);
  if (hasServiceAccount) await usersCollection().doc(uid).set(updated, { merge:true });
  return updated;
}
export async function grantUserPremium(uid:string,durationDays=30){
  const days = Math.max(1, Math.min(3660, Number(durationDays)||30));
  return updateUser(uid,{ plan:'premium', premiumExpiresAt:new Date(Date.now()+days*86400000).toISOString() });
}
export async function removeUserPremium(uid:string){ return updateUser(uid,{ plan:'free', premiumExpiresAt:null }); }
export async function setUserBanStatus(uid:string,isBanned:boolean){ return updateUser(uid,{ isBanned }); }
export async function resetUserDailyUsage(uid:string){ return updateUser(uid,{ dailyMessageCount:0, lastUsageDate:new Date().toISOString().slice(0,10) }); }
export async function setUserCustomLimits(uid:string,customDailyMessageLimit:number|null,customRateLimitPerMinute:number|null){
  const daily = customDailyMessageLimit == null ? null : Math.max(1, Math.min(100000, Number(customDailyMessageLimit)));
  const rate = customRateLimitPerMinute == null ? null : Math.max(1, Math.min(10000, Number(customRateLimitPerMinute)));
  return updateUser(uid,{ customDailyMessageLimit:daily, customRateLimitPerMinute:rate });
}
