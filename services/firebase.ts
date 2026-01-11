import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  getDoc 
} from 'firebase/firestore';

// WARNING: Replace with your actual Firebase config to sync with your phone app.
// Ensure the apiKey and other fields match exactly what is used in your mobile application.
const firebaseConfig = {
  apiKey: "AIzaSyD20V5lPSlcdjSrkB_6TF_cLorY7fuKTE0",
  authDomain: "cfp-webapp-db.firebaseapp.com",
  projectId: "cfp-webapp-db",
  storageBucket: "cfp-webapp-db.firebasestorage.app",
  messagingSenderId: "153424490844",
  appId: "1:153424490844:web:c82e38ecf5f6f91394d199"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Export as a function to avoid 'not callable' errors and ensure a clean reference
export const getDb = () => db;

export { 
  collection, 
  doc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  getDoc 
};
export default db;