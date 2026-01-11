
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

// หมายเหตุ: กรุณาเปลี่ยน config ด้านล่างนี้ให้เป็นของ Firebase Project ของท่าน
// หากยังไม่ได้ตั้งค่า ระบบจะพยายามเชื่อมต่อผ่านค่าพื้นฐานที่ระบบต้องการ
const firebaseConfig = {
  apiKey: "AIzaSy...", // ใส่ API Key ของท่านที่ได้จาก Firebase Console
  authDomain: "cfp-pos-v4.firebaseapp.com",
  projectId: "cfp-pos-v4",
  storageBucket: "cfp-pos-v4.appspot.com",
  messagingSenderId: "772183955627",
  appId: "1:772183955627:web:8c5b0b30c1e548f0"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Fixed: Export getDb as a function to resolve 'not callable' errors in App.tsx
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
