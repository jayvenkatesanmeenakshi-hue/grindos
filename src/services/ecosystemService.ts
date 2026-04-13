import { db } from '../firebase'; 
import { doc, setDoc, getDoc, getDocFromServer, serverTimestamp } from 'firebase/firestore';

export const syncEcosystemUser = async (user: any, appName: string) => {
  if (!user) return;
  const docRef = doc(db, 'users', user.uid);
  try {
    // Try server first, but fallback to cache if offline
    let docSnap;
    try {
      docSnap = await getDocFromServer(docRef);
    } catch (serverError: any) {
      console.warn('Server fetch failed, falling back to cache:', serverError.message);
      docSnap = await getDoc(docRef);
    }
    
    const existingData = docSnap.exists() ? docSnap.data() : null;
    const appsUsed = existingData?.appsUsed || [];
    if (!appsUsed.includes(appName)) {
      appsUsed.push(appName);
    }
    await setDoc(docRef, {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
      lastLogin: serverTimestamp(),
      appsUsed: appsUsed
    }, { merge: true });
  } catch (error) {
    console.error('Ecosystem Sync Failed:', error);
  }
};
