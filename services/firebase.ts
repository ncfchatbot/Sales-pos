import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot, 
  query, 
  orderBy,
  Firestore
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyD20V5lPSlcdjSrkB_6TF_cLorY7fuKTE0",
  authDomain: "cfp-webapp-db.firebaseapp.com",
  projectId: "cfp-webapp-db",
  storageBucket: "cfp-webapp-db.firebasestorage.app",
  messagingSenderId: "153424490844",
  appId: "1:153424490844:web:c82e38ecf5f6f91394d199"
};

// Initialize or get the existing Firebase app
const app: FirebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Get Firestore instance using the specific app to ensure they are bound together
const db: Firestore = getFirestore(app);

export const getDb = (): Firestore => db;

export { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot, 
  query, 
  orderBy 
};