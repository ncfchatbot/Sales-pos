import { initializeApp, getApp, getApps, FirebaseApp } from "firebase/app";
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

// --- PASTE YOUR FIREBASE CONFIG HERE ---
// โปรดใส่ Config ของคุณจาก Firebase Console
const firebaseConfig = {
  apiKey: "AIzaSyD20V5lPSlcdjSrkB_6TF_cLorY7fuKTE0",
  authDomain: "cfp-webapp-db.firebaseapp.com",
  projectId: "cfp-webapp-db",
  storageBucket: "cfp-webapp-db.firebasestorage.app",
  messagingSenderId: "153424490844",
  appId: "1:153424490844:web:c82e38ecf5f6f91394d199"
};

/**
 * Initialize Firebase App
 * ใน ESM environment เราต้องมั่นใจว่าใช้ Instance เดียวกันทั้งหมด
 */
const app: FirebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

/**
 * บังคับให้ getFirestore รับ app object เพื่อยืนยันว่า
 * Firestore service จะถูกผูกกับ App instance ที่ถูกต้อง
 */
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