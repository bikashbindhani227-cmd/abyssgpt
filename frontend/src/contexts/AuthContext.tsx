import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  auth,
  googleProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  firebaseSignOut,
  sendPasswordResetEmail,
  updateProfile as updateFirebaseProfile,
  onAuthStateChanged,
  type FirebaseUser,
} from '../lib/firebase.js';
import { apiRequest } from '../lib/api.js';
import type { UserProfile } from '../types.js';

interface LimitsSummary {
  dailyLimit: number;
  rateLimit: number;
  contextLimit: number;
}

interface AuthContextType {
  firebaseUser: FirebaseUser | null;
  userProfile: UserProfile | null;
  limits: LimitsSummary | null;
  loading: boolean;
  isAdmin: boolean;
  isPremium: boolean;
  signInWithEmail: (email: string, pass: string) => Promise<void>;
  signUpWithEmail: (email: string, pass: string, name?: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
  updateDisplayName: (name: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [limits, setLimits] = useState<LimitsSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async (user: FirebaseUser) => {
    try {
      const data = await apiRequest<{ user: UserProfile; limits: LimitsSummary }>('/api/user/profile');
      setUserProfile(data.user);
      setLimits(data.limits);
    } catch (err) {
      console.warn('Could not sync user profile with backend yet:', err);
      // Fallback provisional profile
      setUserProfile({
        uid: user.uid,
        email: user.email || '',
        displayName: user.displayName || user.email?.split('@')[0] || 'User',
        photoURL: user.photoURL || undefined,
        plan: 'free',
        isAdmin: false,
        isBanned: false,
        dailyMessageLimit: 20,
        dailyMessageCount: 0,
        lastUsageDate: new Date().toISOString().slice(0, 10),
        rateLimitPerMinute: 5,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
      });
      setLimits({
        dailyLimit: 20,
        rateLimit: 5,
        contextLimit: 10,
      });
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!auth.currentUser) return;
    await fetchProfile(auth.currentUser);
  }, [fetchProfile]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        await fetchProfile(user);
      } else {
        setUserProfile(null);
        setLimits(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [fetchProfile]);

  const signInWithEmail = async (email: string, pass: string) => {
    const cred = await signInWithEmailAndPassword(auth, email, pass);
    await fetchProfile(cred.user);
  };

  const signUpWithEmail = async (email: string, pass: string, name?: string) => {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    if (name && cred.user) {
      await updateFirebaseProfile(cred.user, { displayName: name });
    }
    await fetchProfile(cred.user);
  };

  const signInWithGoogle = async () => {
    const cred = await signInWithPopup(auth, googleProvider);
    await fetchProfile(cred.user);
  };

  const logout = async () => {
    await firebaseSignOut(auth);
    setUserProfile(null);
    setLimits(null);
  };

  const sendPasswordReset = async (email: string) => {
    await sendPasswordResetEmail(auth, email);
  };

  const updateDisplayName = async (name: string) => {
    if (!auth.currentUser) return;
    await updateFirebaseProfile(auth.currentUser, { displayName: name });
    await apiRequest('/api/user/profile', {
      method: 'PATCH',
      body: JSON.stringify({ displayName: name }),
    });
    await refreshProfile();
  };

  const isAdmin = Boolean(userProfile?.isAdmin);
  const isPremium = userProfile?.plan === 'premium';

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        userProfile,
        limits,
        loading,
        isAdmin,
        isPremium,
        signInWithEmail,
        signUpWithEmail,
        signInWithGoogle,
        logout,
        sendPasswordReset,
        refreshProfile,
        updateDisplayName,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
