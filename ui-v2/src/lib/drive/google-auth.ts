import { getApps, getApp, initializeApp } from "firebase/app";
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  type User,
  signOut,
} from "firebase/auth";
import { useEffect, useState } from "react";
import { firebaseConfig } from "./firebase-config";

// Drive Scopes requested and configured
export const DRIVE_SCOPES = [
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/drive.activity",
  "https://www.googleapis.com/auth/drive.activity.readonly",
  "https://www.googleapis.com/auth/drive.appdata",
  "https://www.googleapis.com/auth/drive.apps.readonly",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/drive.install",
  "https://www.googleapis.com/auth/drive.meet.readonly",
  "https://www.googleapis.com/auth/drive.metadata",
  "https://www.googleapis.com/auth/drive.metadata.readonly",
  "https://www.googleapis.com/auth/drive.photos.readonly",
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/drive.scripts",
];

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);

export const googleProvider = new GoogleAuthProvider();
for (const scope of DRIVE_SCOPES) {
  googleProvider.addScope(scope);
}
googleProvider.setCustomParameters({
  prompt: "consent",
  access_type: "offline",
});

let isSigningIn = false;
let cachedAccessToken: string | null = null;
const listeners = new Set<(token: string | null, user: User | null) => void>();

function notifyListeners(user: User | null) {
  for (const listener of listeners) {
    listener(cachedAccessToken, user);
  }
}

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void,
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
    notifyListeners(user);
  });
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, googleProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error("Failed to get Google Drive OAuth access token from Firebase Auth credential.");
    }
    cachedAccessToken = credential.accessToken;
    notifyListeners(result.user);
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error) {
    console.error("Google Drive Sign-in error:", error);
    if (error instanceof Error && error.message.includes("auth/unauthorized-domain")) {
      throw new Error(
        `Google Drive sign-in is blocked because "${window.location.hostname}" isn't an authorized domain for this Firebase project. ` +
          `Add it in Firebase Console → Authentication → Settings → Authorized domains.`,
      );
    }
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const setCachedAccessToken = (token: string | null) => {
  cachedAccessToken = token;
  notifyListeners(auth.currentUser);
};

export const logoutGoogle = async () => {
  await signOut(auth);
  cachedAccessToken = null;
  notifyListeners(null);
};

export function useGoogleDriveAuth() {
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [token, setToken] = useState<string | null>(cachedAccessToken);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const unsub = initAuth(
      (u, t) => {
        setUser(u);
        setToken(t);
      },
      () => {
        setUser(auth.currentUser);
        setToken(cachedAccessToken);
      },
    );

    const onChange = (newToken: string | null, newUser: User | null) => {
      setToken(newToken);
      setUser(newUser);
    };
    listeners.add(onChange);

    return () => {
      unsub();
      listeners.delete(onChange);
    };
  }, []);

  const signIn = async () => {
    setLoading(true);
    try {
      const res = await googleSignIn();
      if (res) {
        setUser(res.user);
        setToken(res.accessToken);
      }
      return res;
    } finally {
      setLoading(false);
    }
  };

  const signOutUser = async () => {
    setLoading(true);
    try {
      await logoutGoogle();
      setUser(null);
      setToken(null);
    } finally {
      setLoading(false);
    }
  };

  return {
    user,
    token,
    isAuthenticated: !!token,
    loading,
    signIn,
    signOut: signOutUser,
  };
}
