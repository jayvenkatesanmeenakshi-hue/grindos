import * as React from 'react';
import { useState, useEffect, useMemo } from 'react';
import { 
  auth, db 
} from './firebase';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider, 
  signOut,
  User as FirebaseUser
} from 'firebase/auth';
import { 
  doc, 
  onSnapshot, 
  setDoc, 
  updateDoc, 
  collection, 
  addDoc, 
  query, 
  orderBy, 
  limit, 
  Timestamp,
  getDoc,
  getDocFromServer,
  serverTimestamp
} from 'firebase/firestore';
import { 
  Trophy, 
  Zap, 
  Flame, 
  BookOpen, 
  Dumbbell, 
  Home, 
  Code, 
  Plus, 
  CheckCircle2, 
  LogOut, 
  User as UserIcon,
  ChevronRight,
  AlertCircle,
  TrendingUp,
  History,
  ShieldAlert,
  Users,
  Heart,
  ListChecks
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Radar, 
  RadarChart, 
  PolarGrid, 
  PolarAngleAxis, 
  ResponsiveContainer 
} from 'recharts';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// --- Utilities ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: any[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null, setSystemError?: (err: string) => void, setLoading?: (loading: boolean) => void) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  
  if (setLoading) setLoading(false);
  
  if (setSystemError) {
    let friendlyMessage = errInfo.error;
    if (errInfo.error.includes('permission-denied')) {
      friendlyMessage = "Permission Denied: Please ensure you have created the Firestore Database in your Firebase Console and deployed the security rules.";
    } else if (errInfo.error.includes('not-found')) {
      friendlyMessage = "Database Not Found: Please ensure you have initialized Firestore in your Firebase Console.";
    }
    setSystemError(friendlyMessage);
  }
  return new Error(JSON.stringify(errInfo));
}

// --- Types ---
interface UserData {
  username: string;
  level: number;
  xp: number;
  streak: number;
  lastActive: any;
  stats: {
    knowledge: number;
    skill: number;
    relationships: number;
    creation: number;
    discipline: number;
  };
  createdAt: any;
}

interface Quest {
  id: string;
  title: string;
  type: 'main' | 'side';
  category: string;
  xpReward: number;
  completed: boolean;
  completedAt: any;
  createdAt: any;
}

interface Activity {
  id: string;
  action: string;
  xpGained: number;
  timestamp: any;
}

// --- Constants ---
const XP_PER_LEVEL = 200;
const TITLES = [
  { max: 5, label: 'Beginner' },
  { max: 10, label: 'Growing' },
  { max: 20, label: 'Skilled' },
  { max: Infinity, label: 'Elite' }
];

// --- Components ---

const ProgressBar = ({ progress, className }: { progress: number, className?: string }) => (
  <div className={cn("h-4 w-full bg-zinc-900 border border-zinc-800 rounded-full overflow-hidden", className)}>
    <motion.div 
      initial={{ width: 0 }}
      animate={{ width: `${Math.min(100, progress)}%` }}
      className="h-full bg-gradient-to-r from-blue-500 to-purple-600 shadow-[0_0_15px_rgba(59,130,246,0.5)]"
    />
  </div>
);

const Card = ({ children, className, title }: { children: React.ReactNode, className?: string, title?: string }) => (
  <div className={cn("bg-zinc-950 border border-zinc-800 rounded-xl p-6 relative overflow-hidden group", className)}>
    <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-zinc-700 to-transparent opacity-50" />
    {title && (
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-xs font-mono uppercase tracking-widest text-zinc-500">{title}</h3>
        <div className="h-[1px] flex-1 ml-4 bg-zinc-800" />
      </div>
    )}
    {children}
  </div>
);

const XPBadge = ({ amount }: { amount: number }) => (
  <span className={cn(
    "text-[10px] font-mono px-2 py-0.5 rounded border",
    amount > 0 ? "text-emerald-400 border-emerald-900/50 bg-emerald-950/30" : "text-rose-400 border-rose-900/50 bg-rose-950/30"
  )}>
    {amount > 0 ? `+${amount}` : amount} XP
  </span>
);

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [quests, setQuests] = useState<Quest[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [showLevelUp, setShowLevelUp] = useState(false);
  const [xpFeedback, setXpFeedback] = useState<{ amount: number, id: number } | null>(null);
  const [isAddingQuest, setIsAddingQuest] = useState(false);
  const [newQuest, setNewQuest] = useState({ title: '', xp: 20, category: 'custom', type: 'main' as 'main' | 'side' });
  const [dbError, setDbError] = useState<string | null>(null);
  const [systemError, setSystemError] = useState<string | null>(null);
  const [authMethod, setAuthMethod] = useState<'popup' | 'redirect'>('redirect');

  // Handle Redirect Result
  useEffect(() => {
    getRedirectResult(auth).catch((err: any) => {
      console.error('Redirect Result Error:', err);
      if (err.code === 'auth/unauthorized-domain') {
        setSystemError(`Login failed: This domain is not authorized. Please add "${window.location.hostname}" to Firebase > Auth > Settings > Authorized domains.`);
      }
    });
  }, []);

  // Connection Test
  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error: any) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          setDbError("Firebase configuration error: The client is offline. Please check your manual setup.");
        }
      }
    }
    testConnection();
  }, []);

  const handleAddQuest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newQuest.title) return;

    const path = `users/${user.uid}/quests`;
    try {
      await addDoc(collection(db, 'users', user.uid, 'quests'), {
        title: newQuest.title,
        type: newQuest.type,
        category: newQuest.category,
        xpReward: Number(newQuest.xp),
        completed: false,
        completedAt: null,
        createdAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path, setSystemError);
    }

    setIsAddingQuest(false);
    setNewQuest({ title: '', xp: 20, category: 'custom', type: 'main' });
  };

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (!u) {
        setUserData(null);
        setQuests([]);
        setActivities([]);
        setLoading(false);
      }
    });
    return unsubscribe;
  }, []);

  // Data Listeners
  useEffect(() => {
    if (!user) return;

    const userDocRef = doc(db, 'users', user.uid);
    const questsRef = collection(db, 'users', user.uid, 'quests');
    const activitiesRef = collection(db, 'users', user.uid, 'activities');

    const unsubUser = onSnapshot(userDocRef, (doc) => {
      if (doc.exists()) {
        const data = doc.data() as UserData;
        if (userData && data.level > userData.level) {
          setShowLevelUp(true);
          setTimeout(() => setShowLevelUp(false), 3000);
        }
        setUserData(data);
      } else {
        // Initialize new user
        const initialData: UserData = {
          username: user.displayName || 'Player',
          level: 1,
          xp: 0,
          streak: 0,
          lastActive: serverTimestamp(),
          stats: {
            knowledge: 0,
            skill: 0,
            relationships: 0,
            creation: 0,
            discipline: 0
          },
          createdAt: serverTimestamp()
        };
        setDoc(userDocRef, initialData).catch(err => {
          handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}`, setSystemError, setLoading);
        });
      }
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `users/${user.uid}`, setSystemError, setLoading);
    });

    const unsubQuests = onSnapshot(questsRef, (snapshot) => {
      const qList = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Quest));
      setQuests(qList);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `users/${user.uid}/quests`, setSystemError);
    });

    const unsubActivities = onSnapshot(query(activitiesRef, orderBy('timestamp', 'desc'), limit(10)), (snapshot) => {
      const aList = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Activity));
      setActivities(aList);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `users/${user.uid}/activities`, setSystemError);
    });

    return () => {
      unsubUser();
      unsubQuests();
      unsubActivities();
    };
  }, [user]);

  // Daily Reset Logic - REMOVED per user request for manual management
  useEffect(() => {
    if (!userData || !user) return;
  }, [userData, quests, user, loading]);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    // Force account selection to help with session issues
    provider.setCustomParameters({ prompt: 'select_account' });

    try {
      if (authMethod === 'popup') {
        await signInWithPopup(auth, provider);
      } else {
        await signInWithRedirect(auth, provider);
      }
    } catch (err: any) {
      console.error('Login Error:', err);
      
      if (err.code === 'auth/unauthorized-domain') {
        setSystemError(`Login failed: This domain is not authorized in your Firebase Console. Please add "${window.location.hostname}" to Authentication > Settings > Authorized domains.`);
      } else if (err.code === 'auth/operation-not-allowed') {
        setSystemError("Login failed: Google Sign-In is not enabled in your Firebase Console. Please enable it in Authentication > Sign-in method.");
      } else if (err.code === 'auth/popup-blocked') {
        setSystemError("Login failed: The popup was blocked by your browser. Please allow popups or try the 'Redirect Mode' below.");
      } else if (err.code === 'auth/popup-closed-by-user') {
        // Silently handle
      } else if (err.code === 'auth/internal-error' || err.code === 'auth/network-request-failed') {
        setSystemError("Login failed: This is often caused by 'Cross-Origin' security headers or blocked third-party cookies. Try switching to 'Redirect Mode' below.");
      } else {
        setSystemError(`Login failed: ${err.message} (${err.code})`);
      }
    }
  };

  const handleLogout = () => signOut(auth);

  const addXP = async (amount: number, action: string, statKey?: keyof UserData['stats']) => {
    if (!user || !userData) return;

    const newXp = userData.xp + amount;
    const newLevel = Math.floor(newXp / XP_PER_LEVEL) + 1;
    
    const updates: any = {
      xp: newXp,
      level: newLevel,
      lastActive: serverTimestamp()
    };

    if (statKey) {
      updates[`stats.${statKey}`] = (userData.stats[statKey] || 0) + 1;
    }

    try {
      await updateDoc(doc(db, 'users', user.uid), updates);
      await addDoc(collection(db, 'users', user.uid, 'activities'), {
        action,
        xpGained: amount,
        timestamp: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`, setSystemError);
    }

    setXpFeedback({ amount, id: Date.now() });
    setTimeout(() => setXpFeedback(null), 2000);
  };

  const toggleQuest = async (quest: Quest, bonus: boolean = false) => {
    if (!user || !userData) return;
    
    const finalAmount = bonus ? quest.xpReward + 20 : quest.xpReward;
    const action = bonus ? `${quest.title} (Discipline Bonus)` : quest.title;
    
    // Map category to stat
    const categoryMap: Record<string, keyof UserData['stats']> = {
      study: 'knowledge',
      physical: 'skill',
      home: 'relationships',
      social: 'relationships',
      project: 'creation',
      productivity: 'discipline',
      custom: 'discipline'
    };

    try {
      await updateDoc(doc(db, 'users', user.uid, 'quests', quest.id), {
        completed: true,
        completedAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}/quests/${quest.id}`, setSystemError);
    }

    addXP(finalAmount, action, categoryMap[quest.category] || 'discipline');

    // Check if all daily quests are done for bonus
    const otherDailies = quests.filter(q => q.type === 'main' && q.id !== quest.id);
    const allDone = otherDailies.every(q => q.completed);
    if (allDone && quest.type === 'main') {
      addXP(50, "Daily Completion Bonus", 'discipline');
    }
  };

  const deleteQuest = async (questId: string) => {
    if (!user) return;
    const { deleteDoc, doc } = await import('firebase/firestore');
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'quests', questId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `users/${user.uid}/quests/${questId}`, setSystemError);
    }
  };

  const resetQuest = async (questId: string) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'users', user.uid, 'quests', questId), {
        completed: false,
        completedAt: null
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}/quests/${questId}`, setSystemError);
    }
  };

  const handlePenalty = (amount: number, action: string) => {
    addXP(-amount, action, 'discipline');
  };

  const currentTitle = useMemo(() => {
    if (!userData) return '';
    return TITLES.find(t => userData.level <= t.max)?.label || 'Elite';
  }, [userData]);

  const radarData = useMemo(() => {
    if (!userData) return [];
    return [
      { subject: 'Knowledge', A: userData.stats.knowledge, fullMark: 100 },
      { subject: 'Skill', A: userData.stats.skill, fullMark: 100 },
      { subject: 'Relationships', A: userData.stats.relationships, fullMark: 100 },
      { subject: 'Creation', A: userData.stats.creation, fullMark: 100 },
      { subject: 'Discipline', A: userData.stats.discipline, fullMark: 100 },
    ];
  }, [userData]);

  if (systemError) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-zinc-950 border border-rose-900/50 p-8 rounded-2xl text-center space-y-4">
          <ShieldAlert className="w-12 h-12 text-rose-500 mx-auto" />
          <h1 className="text-xl font-bold">System Error</h1>
          <p className="text-zinc-400 text-sm">{systemError}</p>
          <div className="flex gap-3">
            <button 
              onClick={() => {
                setSystemError(null);
                setAuthMethod('redirect');
                handleLogin();
              }}
              className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold transition-colors text-sm"
            >
              Try Redirect Mode
            </button>
            <button 
              onClick={() => window.location.reload()}
              className="flex-1 py-3 bg-zinc-800 hover:bg-zinc-700 rounded-xl font-bold transition-colors text-sm"
            >
              Reboot
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (dbError) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-zinc-950 border border-rose-900/50 p-8 rounded-2xl text-center space-y-4">
          <ShieldAlert className="w-12 h-12 text-rose-500 mx-auto" />
          <h1 className="text-xl font-bold">Configuration Error</h1>
          <p className="text-zinc-400 text-sm">{dbError}</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-4">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full"
        />
        <p className="text-zinc-500 font-mono text-xs animate-pulse uppercase tracking-widest">
          Initializing System...
        </p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-4 relative overflow-hidden">
        {/* Background Accents */}
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-900/20 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-900/20 blur-[120px] rounded-full" />
        
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="z-10 text-center max-w-md"
        >
          <div className="mb-8 flex justify-center">
            <div className="w-20 h-20 bg-zinc-900 border border-zinc-800 rounded-2xl flex items-center justify-center shadow-[0_0_30px_rgba(59,130,246,0.2)]">
              <Zap className="w-10 h-10 text-blue-500 fill-blue-500/20" />
            </div>
          </div>
          <h1 className="text-5xl font-bold tracking-tighter mb-4 bg-gradient-to-b from-white to-zinc-500 bg-clip-text text-transparent">
            GrindOS
          </h1>
          <p className="text-zinc-400 mb-10 text-lg leading-relaxed">
            Turn your daily life into an RPG. Level up your knowledge, skills, and discipline.
          </p>
          <button 
            onClick={handleLogin}
            className="w-full py-4 px-8 bg-white text-black font-bold rounded-xl hover:bg-zinc-200 transition-all flex items-center justify-center gap-3 group"
          >
            <UserIcon className="w-5 h-5" />
            Enter the Grind
            <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </button>

          <div className="mt-4 flex flex-col items-center gap-2">
            <p className="text-[10px] text-zinc-500 font-mono uppercase">Login Method</p>
            <div className="flex bg-zinc-900 p-1 rounded-lg border border-zinc-800">
              <button 
                onClick={() => setAuthMethod('popup')}
                className={cn(
                  "px-4 py-1.5 rounded-md text-[10px] font-bold transition-all",
                  authMethod === 'popup' ? "bg-zinc-800 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-300"
                )}
              >
                POPUP
              </button>
              <button 
                onClick={() => setAuthMethod('redirect')}
                className={cn(
                  "px-4 py-1.5 rounded-md text-[10px] font-bold transition-all",
                  authMethod === 'redirect' ? "bg-zinc-800 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-300"
                )}
              >
                REDIRECT
              </button>
            </div>
            {authMethod === 'redirect' && (
              <p className="text-[10px] text-blue-500/60 font-mono text-center max-w-[200px]">
                Recommended for custom domains or browsers blocking popups.
              </p>
            )}
          </div>
          <p className="mt-6 text-xs text-zinc-600 font-mono uppercase tracking-widest">
            v1.0.0 // System Online
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-zinc-100 font-sans selection:bg-blue-500/30">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-black/80 backdrop-blur-md border-b border-zinc-900 px-4 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Zap className="w-6 h-6 text-blue-500" />
            <span className="font-bold tracking-tighter text-xl">GrindOS</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex flex-col items-end">
              <span className="text-xs font-mono text-zinc-500 uppercase">{currentTitle}</span>
              <span className="text-sm font-bold">{userData?.username}</span>
            </div>
            <button 
              onClick={handleLogout}
              className="p-2 hover:bg-zinc-900 rounded-lg transition-colors text-zinc-500 hover:text-white"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-4 sm:p-8 space-y-8">
        {/* Level & XP Section */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="md:col-span-2 flex flex-col justify-center">
            <div className="flex items-end justify-between mb-4">
              <div>
                <h2 className="text-xs font-mono text-zinc-500 uppercase tracking-widest mb-1">Current Level</h2>
                <div className="flex items-baseline gap-3">
                  <span className="text-7xl font-black tracking-tighter text-white">{userData?.level}</span>
                  <span className="text-blue-500 font-mono text-sm uppercase tracking-widest">{currentTitle}</span>
                </div>
              </div>
              <div className="text-right">
                <div className="flex items-center gap-2 text-orange-500 mb-1">
                  <Flame className="w-4 h-4 fill-orange-500/20" />
                  <span className="font-bold">{userData?.streak} Day Streak</span>
                </div>
                <div className="text-xs font-mono text-zinc-500 uppercase">
                  {userData?.xp % XP_PER_LEVEL} / {XP_PER_LEVEL} XP
                </div>
              </div>
            </div>
            <ProgressBar progress={((userData?.xp || 0) % XP_PER_LEVEL) / XP_PER_LEVEL * 100} />
          </Card>

          <Card title="Daily Stats" className="flex flex-col justify-center">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-[10px] font-mono text-zinc-500 uppercase">XP Today</p>
                <p className="text-2xl font-bold text-white">+{activities.filter(a => {
                  const today = new Date();
                  const ts = a.timestamp?.toDate();
                  return ts && ts.toDateString() === today.toDateString();
                }).reduce((acc, curr) => acc + curr.xpGained, 0)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-mono text-zinc-500 uppercase">Quests</p>
                <p className="text-2xl font-bold text-white">
                  {quests.filter(q => q.completed).length}/{quests.length}
                </p>
              </div>
            </div>
          </Card>
        </section>

        {/* Quests & Stats Section */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Quests */}
          <div className="lg:col-span-2 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Trophy className="w-5 h-5 text-yellow-500" />
                Active Quests
              </h2>
              <div className="flex gap-2">
                <span className="text-[10px] font-mono bg-zinc-900 border border-zinc-800 px-2 py-1 rounded text-zinc-500">
                  {quests.filter(q => q.type === 'main').length} MAIN
                </span>
                <span className="text-[10px] font-mono bg-zinc-900 border border-zinc-800 px-2 py-1 rounded text-zinc-500">
                  {quests.filter(q => q.type === 'side').length} SIDE
                </span>
              </div>
            </div>

            <div className="space-y-3">
              {quests.sort((a, b) => Number(a.completed) - Number(b.completed)).map((quest) => (
                <motion.div 
                  layout
                  key={quest.id}
                  className={cn(
                    "group flex items-center justify-between p-4 rounded-xl border transition-all",
                    quest.completed 
                      ? "bg-zinc-950/50 border-zinc-900 opacity-50" 
                      : "bg-zinc-900/30 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900/50"
                  )}
                >
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      "w-10 h-10 rounded-lg flex items-center justify-center border",
                      quest.completed ? "bg-zinc-900 border-zinc-800" : "bg-zinc-800 border-zinc-700"
                    )}>
                      {quest.category === 'study' && <BookOpen className="w-5 h-5 text-blue-400" />}
                      {quest.category === 'physical' && <Dumbbell className="w-5 h-5 text-emerald-400" />}
                      {quest.category === 'home' && <Home className="w-5 h-5 text-rose-400" />}
                      {quest.category === 'social' && <Users className="w-5 h-5 text-pink-400" />}
                      {quest.category === 'project' && <Code className="w-5 h-5 text-purple-400" />}
                      {quest.category === 'productivity' && <ListChecks className="w-5 h-5 text-orange-400" />}
                      {quest.category === 'custom' && <Zap className="w-5 h-5 text-yellow-400" />}
                    </div>
                    <div>
                      <h4 className={cn("font-medium", quest.completed && "line-through text-zinc-600")}>
                        {quest.title}
                      </h4>
                      <div className="flex items-center gap-2 mt-1">
                        <XPBadge amount={quest.xpReward} />
                        <span className="text-[10px] font-mono text-zinc-600 uppercase">{quest.type}</span>
                      </div>
                    </div>
                  </div>
                  
                  {!quest.completed && (
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => deleteQuest(quest.id)}
                        className="p-2 bg-zinc-800 text-zinc-500 hover:text-rose-500 rounded-lg transition-all"
                        title="Delete Quest"
                      >
                        <AlertCircle className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => toggleQuest(quest, true)}
                        className="p-2 bg-orange-500/10 text-orange-500 border border-orange-500/20 rounded-lg hover:bg-orange-500 hover:text-white transition-all text-xs font-bold"
                        title="Discipline Bonus (+20 XP)"
                      >
                        <Flame className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => toggleQuest(quest)}
                        className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-all"
                      >
                        <CheckCircle2 className="w-5 h-5" />
                      </button>
                    </div>
                  )}
                  {quest.completed && (
                    <div className="flex items-center gap-3">
                      <button 
                        onClick={() => resetQuest(quest.id)}
                        className="p-2 bg-zinc-800 text-zinc-500 hover:text-blue-500 rounded-lg transition-all"
                        title="Reset Quest"
                      >
                        <History className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => deleteQuest(quest.id)}
                        className="p-2 bg-zinc-800 text-zinc-500 hover:text-rose-500 rounded-lg transition-all"
                        title="Delete Quest"
                      >
                        <AlertCircle className="w-4 h-4" />
                      </button>
                      <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                    </div>
                  )}
                </motion.div>
              ))}
              
              {/* Add Custom Quest */}
              <button 
                onClick={() => setIsAddingQuest(true)}
                className="w-full py-4 border-2 border-dashed border-zinc-800 rounded-xl text-zinc-500 hover:text-zinc-300 hover:border-zinc-600 transition-all flex items-center justify-center gap-2 group"
              >
                <Plus className="w-5 h-5 group-hover:rotate-90 transition-transform" />
                <span className="text-sm font-medium">Add Side Quest</span>
              </button>
            </div>
          </div>

          {/* Stats & Activity */}
          <div className="space-y-8">
            <Card title="Attributes">
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarData}>
                    <PolarGrid stroke="#27272a" />
                    <PolarAngleAxis dataKey="subject" tick={{ fill: '#71717a', fontSize: 10 }} />
                    <Radar
                      name="Stats"
                      dataKey="A"
                      stroke="#3b82f6"
                      fill="#3b82f6"
                      fillOpacity={0.3}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-3 mt-4">
                {radarData.map(stat => (
                  <div key={stat.subject} className="flex items-center justify-between text-xs">
                    <span className="text-zinc-500 font-mono uppercase">{stat.subject}</span>
                    <span className="font-bold text-white">{stat.A}</span>
                  </div>
                ))}
              </div>
            </Card>

            <Card title="Activity Log">
              <div className="space-y-4">
                {activities.map((activity) => (
                  <div key={activity.id} className="flex items-start justify-between gap-4">
                    <div className="flex gap-3">
                      <div className="mt-1 w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
                      <div>
                        <p className="text-sm text-zinc-300 leading-tight">{activity.action}</p>
                        <p className="text-[10px] text-zinc-600 font-mono mt-0.5">
                          {activity.timestamp?.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                    <XPBadge amount={activity.xpGained} />
                  </div>
                ))}
                {activities.length === 0 && (
                  <p className="text-center text-zinc-600 text-xs py-4 italic">No recent activity detected.</p>
                )}
              </div>
            </Card>

            <Card title="System Penalties" className="border-rose-900/20 bg-rose-950/5">
              <div className="space-y-3">
                <button 
                  onClick={() => handlePenalty(30, "Procrastinated Day")}
                  className="w-full flex items-center justify-between p-3 rounded-lg bg-rose-950/20 border border-rose-900/30 hover:bg-rose-900/30 transition-all group"
                >
                  <div className="flex items-center gap-3">
                    <AlertCircle className="w-4 h-4 text-rose-500" />
                    <span className="text-xs font-medium text-rose-200">Procrastinated</span>
                  </div>
                  <span className="text-xs font-mono text-rose-500">-30 XP</span>
                </button>
                <button 
                  onClick={() => handlePenalty(40, "Avoided Responsibility")}
                  className="w-full flex items-center justify-between p-3 rounded-lg bg-rose-950/20 border border-rose-900/30 hover:bg-rose-900/30 transition-all group"
                >
                  <div className="flex items-center gap-3">
                    <ShieldAlert className="w-4 h-4 text-rose-500" />
                    <span className="text-xs font-medium text-rose-200">Avoided Duty</span>
                  </div>
                  <span className="text-xs font-mono text-rose-500">-40 XP</span>
                </button>
              </div>
            </Card>
          </div>
        </section>
      </main>

      {/* Level Up Overlay */}
      <AnimatePresence>
        {showLevelUp && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-xl"
          >
            <motion.div 
              initial={{ scale: 0.5, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="text-center"
            >
              <motion.div 
                animate={{ 
                  scale: [1, 1.2, 1],
                  rotate: [0, 10, -10, 0]
                }}
                transition={{ duration: 0.5, repeat: 2 }}
                className="inline-block p-6 bg-blue-500 rounded-full shadow-[0_0_50px_rgba(59,130,246,0.5)] mb-6"
              >
                <TrendingUp className="w-16 h-16 text-white" />
              </motion.div>
              <h2 className="text-6xl font-black tracking-tighter text-white mb-2">LEVEL UP!</h2>
              <p className="text-blue-400 font-mono uppercase tracking-[0.3em] text-xl">
                Reached Level {userData?.level}
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* XP Floating Feedback */}
      <AnimatePresence>
        {xpFeedback && (
          <motion.div 
            key={xpFeedback.id}
            initial={{ opacity: 0, y: 20, x: '-50%' }}
            animate={{ opacity: 1, y: -40, x: '-50%' }}
            exit={{ opacity: 0 }}
            className={cn(
              "fixed bottom-10 left-1/2 z-[90] font-black text-2xl tracking-tighter",
              xpFeedback.amount > 0 ? "text-emerald-400" : "text-rose-400"
            )}
          >
            {xpFeedback.amount > 0 ? `+${xpFeedback.amount}` : xpFeedback.amount} XP
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Quest Modal */}
      <AnimatePresence>
        {isAddingQuest && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-zinc-950 border border-zinc-800 p-8 rounded-2xl w-full max-w-md shadow-2xl"
            >
              <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                <Plus className="w-5 h-5 text-blue-500" />
                New Side Quest
              </h3>
              <form onSubmit={handleAddQuest} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Quest Title</label>
                  <input 
                    autoFocus
                    required
                    type="text" 
                    value={newQuest.title}
                    onChange={e => setNewQuest({...newQuest, title: e.target.value})}
                    placeholder="e.g. Finish Chapter 4"
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">XP Reward</label>
                    <input 
                      required
                      type="number" 
                      value={newQuest.xp}
                      onChange={e => setNewQuest({...newQuest, xp: parseInt(e.target.value)})}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition-colors"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Category</label>
                    <select 
                      value={newQuest.category}
                      onChange={e => setNewQuest({...newQuest, category: e.target.value})}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition-colors appearance-none"
                    >
                      <option value="study">Study</option>
                      <option value="physical">Physical</option>
                      <option value="home">Home</option>
                      <option value="social">Social</option>
                      <option value="project">Project</option>
                      <option value="productivity">Productivity</option>
                      <option value="custom">Custom</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Quest Type</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button 
                      type="button"
                      onClick={() => setNewQuest({...newQuest, type: 'main'})}
                      className={cn(
                        "py-2 rounded-lg text-xs font-bold border transition-all",
                        newQuest.type === 'main' ? "bg-blue-600 border-blue-500 text-white" : "bg-zinc-900 border-zinc-800 text-zinc-500"
                      )}
                    >
                      Main Quest
                    </button>
                    <button 
                      type="button"
                      onClick={() => setNewQuest({...newQuest, type: 'side'})}
                      className={cn(
                        "py-2 rounded-lg text-xs font-bold border transition-all",
                        newQuest.type === 'side' ? "bg-purple-600 border-purple-500 text-white" : "bg-zinc-900 border-zinc-800 text-zinc-500"
                      )}
                    >
                      Side Quest
                    </button>
                  </div>
                </div>
                <div className="flex gap-3 pt-4">
                  <button 
                    type="button"
                    onClick={() => setIsAddingQuest(false)}
                    className="flex-1 py-3 bg-zinc-900 text-zinc-400 font-bold rounded-lg hover:bg-zinc-800 transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-500 transition-all shadow-[0_0_20px_rgba(59,130,246,0.3)]"
                  >
                    Initialize
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <footer className="max-w-5xl mx-auto p-8 border-t border-zinc-900 text-center">
        <p className="text-zinc-600 text-[10px] font-mono uppercase tracking-widest">
          GrindOS // Student RPG System // Connected to Firebase
        </p>
      </footer>
    </div>
  );
}
