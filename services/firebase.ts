/**
 * Local Database Service (Firestore Alternative)
 * จำลองคำสั่ง Firestore API โดยใช้ Browser LocalStorage
 * เพื่อแก้ปัญหา 'Service firestore is not available' อย่างถาวร
 */

export type Firestore = any;
export type FirebaseApp = any;

const STORAGE_PREFIX = 'cfp_pos_v4';

// ตัวจัดการการแจ้งเตือนเมื่อข้อมูลเปลี่ยน (Event Emitter)
const listeners = new Set<() => void>();
const notify = () => {
  listeners.forEach(l => l());
};

// ฟังเหตุการณ์การเปลี่ยนข้อมูลจาก Tab อื่น
window.addEventListener('storage', (e) => {
  if (e.key?.startsWith(STORAGE_PREFIX)) {
    notify();
  }
});

const dbInstance = {};

export const getDb = (): Firestore => dbInstance;

// ฟังก์ชันสร้าง Reference แบบจำลอง
export const collection = (db: Firestore, path: string) => ({ type: 'collection', path });
export const doc = (db: Firestore, path: string, id?: string) => {
  if (id) return { type: 'doc', path: `${path}/${id}`, id };
  const parts = path.split('/');
  const docId = parts.pop();
  return { type: 'doc', path, id: docId };
};

// ตัวจัดการ Query (จำลอง)
export const query = (colRef: any, ...constraints: any[]) => ({ ...colRef, constraints });
export const orderBy = (field: string, direction: 'asc' | 'desc' = 'asc') => ({ type: 'orderBy', field, direction });

// ฟังก์ชันดึง Key สำหรับ Storage
const getStorageKey = (path: string) => `${STORAGE_PREFIX}_${path.replace(/\//g, '_')}`;

// คำสั่งจัดการข้อมูล (CRUD)
export const setDoc = async (docRef: any, data: any, options?: { merge?: boolean }) => {
  const current = localStorage.getItem(getStorageKey(docRef.path));
  let newData = data;
  
  if (options?.merge && current) {
    newData = { ...JSON.parse(current), ...data };
  }
  
  localStorage.setItem(getStorageKey(docRef.path), JSON.stringify(newData));
  
  // บันทึก Registry ของ Document IDs ใน Collection
  const collectionPath = docRef.path.split('/').slice(0, -1).join('/');
  const registryKey = `${getStorageKey(collectionPath)}_registry`;
  const registry = JSON.parse(localStorage.getItem(registryKey) || '[]');
  if (!registry.includes(docRef.id)) {
    registry.push(docRef.id);
    localStorage.setItem(registryKey, JSON.stringify(registry));
  }
  
  notify();
};

export const updateDoc = async (docRef: any, data: any) => {
  await setDoc(docRef, data, { merge: true });
};

export const deleteDoc = async (docRef: any) => {
  localStorage.removeItem(getStorageKey(docRef.path));
  
  const collectionPath = docRef.path.split('/').slice(0, -1).join('/');
  const registryKey = `${getStorageKey(collectionPath)}_registry`;
  const registry = JSON.parse(localStorage.getItem(registryKey) || '[]');
  const newRegistry = registry.filter((id: string) => id !== docRef.id);
  localStorage.setItem(registryKey, JSON.stringify(newRegistry));
  
  notify();
};

export const getDoc = async (docRef: any) => {
  const data = localStorage.getItem(getStorageKey(docRef.path));
  return {
    exists: () => data !== null,
    data: () => (data ? JSON.parse(data) : undefined),
    id: docRef.id
  };
};

// ระบบ Real-time Listener (จำลอง onSnapshot)
export const onSnapshot = (ref: any, callback: (snapshot: any) => void) => {
  const handler = () => {
    if (ref.type === 'collection') {
      const registryKey = `${getStorageKey(ref.path)}_registry`;
      const registry = JSON.parse(localStorage.getItem(registryKey) || '[]');
      
      let docs = registry.map((id: string) => {
        const data = localStorage.getItem(getStorageKey(`${ref.path}/${id}`));
        return data ? { id, data: () => JSON.parse(data) } : null;
      }).filter(Boolean);
      
      // จัดการการเรียงลำดับ (Sorting)
      const sortConstraint = ref.constraints?.find((c: any) => c.type === 'orderBy');
      if (sortConstraint) {
        docs.sort((a: any, b: any) => {
          const valA = a.data()[sortConstraint.field];
          const valB = b.data()[sortConstraint.field];
          if (sortConstraint.direction === 'desc') {
            return valB > valA ? 1 : -1;
          }
          return valA > valB ? 1 : -1;
        });
      }

      callback({ docs });
    } else if (ref.type === 'doc') {
      const data = localStorage.getItem(getStorageKey(ref.path));
      callback({
        exists: () => data !== null,
        data: () => (data ? JSON.parse(data) : undefined),
        id: ref.id
      });
    }
  };

  listeners.add(handler);
  setTimeout(handler, 0); // เรียกครั้งแรกทันที
  
  return () => {
    listeners.delete(handler);
  };
};