/**
 * Formats Firebase and custom authentication errors into clear, friendly, and actionable messages.
 */
export function formatAuthError(error: unknown): string {
  if (!error) return 'An unexpected error occurred. Please try again.';

  const errObj = error as { code?: string; message?: string };
  const code = errObj.code || '';
  const rawMsg = errObj.message || String(error);

  switch (code) {
    case 'auth/operation-not-allowed':
      return 'Email and password sign-in is currently disabled or initializing in Firebase. Please sign in with "Continue with Google" above.';

    case 'auth/invalid-credential':
    case 'auth/wrong-password':
      return 'Invalid email or password. If you previously created your account using Google, please tap "Continue with Google" or use "Forgot password?" to set a password.';

    case 'auth/user-not-found':
      return 'No account was found with this email address. Please check for typos or click "Sign up" below to create an account.';

    case 'auth/email-already-in-use':
      return 'An account already exists with this email address. Please sign in using your existing account or "Continue with Google".';

    case 'auth/weak-password':
      return 'The password is too weak. Please use at least 6 characters with a combination of letters and numbers.';

    case 'auth/popup-blocked':
      return 'Google sign-in popup was blocked by your browser. Please allow popups for this site or open the app in a full browser tab.';

    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'Google sign-in was cancelled before completion. Please try again.';

    case 'auth/unauthorized-domain':
      return 'This preview domain is not authorized in Firebase OAuth settings. Please use email sign-in or access the app via the primary domain.';

    case 'auth/too-many-requests':
      return 'Too many unsuccessful attempts. Access to this account has been temporarily disabled. Please reset your password or try again later.';

    case 'auth/network-request-failed':
      return 'Network connection error. Please verify your internet connection and try again.';

    case 'auth/invalid-email':
      return 'Please enter a valid email address.';

    default: {
      // Clean up any raw "Firebase: Error (auth/foo-bar)." syntax
      const match = rawMsg.match(/Firebase:\s*Error\s*\(([^)]+)\)\.?/i);
      if (match && match[1]) {
        return formatAuthError({ code: match[1], message: rawMsg });
      }
      return rawMsg.replace(/^Firebase:\s*/i, '');
    }
  }
}
