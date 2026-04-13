import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

// Support both named databases (AI Studio default) and the default database (manual setup)
export const db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true });

export const auth = getAuth(app);

export default app;
