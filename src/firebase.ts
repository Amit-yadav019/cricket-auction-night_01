import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, User } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer, Firestore } from 'firebase/firestore';

export const firebaseConfig = {
  apiKey: "AIzaSyBWrly8D_Cm9b30skGQ6ygez7Xy9ae8nNk",
  authDomain: "cricket-auction-night-a702f.firebaseapp.com",
  projectId: "cricket-auction-night-a702f",
  storageBucket: "cricket-auction-night-a702f.firebasestorage.app",
  messagingSenderId: "98516714068",
  appId: "1:98516714068:web:c1655906b2b00b7b0ba3c1"
};

const app = initializeApp(firebaseConfig);

export const db: Firestore = getFirestore(app);
export const auth = getAuth(app);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

/**
 * Initializes anonymous authentication with fallback for local sessions.
 */
export async function initAnonymousAuth(): Promise<{ user: User | null; error?: string }> {
  try {
    if (auth.currentUser) {
      return { user: auth.currentUser };
    }
    const cred = await signInAnonymously(auth);
    return { user: cred.user };
  } catch (err: any) {
    console.warn('Anonymous auth note:', err?.message || err);
    return {
      user: null,
      error:
        err?.code === 'auth/operation-not-allowed' ||
        err?.code === 'auth/admin-restricted-operation'
          ? 'Anonymous sign-in is disabled in your Firebase console. Enable it in Authentication > Sign-in method.'
          : err?.message || 'Authentication error',
    };
  }
}

/**
 * Test connectivity to Firestore as recommended by Firebase
 */
export async function testConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'system', 'connection_test'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firestore offline status check:', error.message);
      return false;
    }
    return true;
  }
}