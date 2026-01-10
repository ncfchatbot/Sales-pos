
// Mock Firebase Service with Reactive Listeners
const listeners: Record<string, Array<(snapshot: any) => void>> = {};

const notify = (collectionPath: string) => {
  if (listeners[collectionPath]) {
    const data = JSON.parse(localStorage.getItem(`firebase_mock_${collectionPath}`) || '[]');
    const snapshot = {
      docs: data.map((item: any) => ({
        id: item.id || 'unknown',
        data: () => item
      }))
    };
    listeners[collectionPath].forEach(cb => cb(snapshot));
  }
};

export const getDb = () => "localStorage_db";

export const collection = (db: any, ...pathSegments: string[]) => pathSegments.join('/');

export const doc = (db: any, ...pathSegments: string[]) => pathSegments.join('/');

export const query = (colRef: any, ...constraints: any[]) => colRef;

export const orderBy = (field: string, direction: string = 'asc') => ({ field, direction });

export const onSnapshot = (ref: string, callback: (snapshot: any) => void) => {
  if (!listeners[ref]) listeners[ref] = [];
  listeners[ref].push(callback);
  
  // Initial call
  const data = JSON.parse(localStorage.getItem(`firebase_mock_${ref}`) || '[]');
  callback({
    docs: data.map((item: any) => ({
      id: item.id || 'unknown',
      data: () => item
    }))
  });

  return () => {
    listeners[ref] = listeners[ref].filter(cb => cb !== callback);
  };
};

export const setDoc = async (docRef: string, data: any, options?: { merge: boolean }) => {
  const pathParts = docRef.split('/');
  const collectionPath = pathParts.slice(0, -1).join('/');
  const docId = pathParts[pathParts.length - 1];

  const currentData = JSON.parse(localStorage.getItem(`firebase_mock_${collectionPath}`) || '[]');
  const existingIndex = currentData.findIndex((item: any) => item.id === docId);

  let newData;
  if (existingIndex >= 0) {
    newData = [...currentData];
    newData[existingIndex] = options?.merge ? { ...newData[existingIndex], ...data } : { ...data, id: docId };
  } else {
    newData = [...currentData, { ...data, id: docId }];
  }

  localStorage.setItem(`firebase_mock_${collectionPath}`, JSON.stringify(newData));
  notify(collectionPath);
};

export const getDoc = async (docRef: string) => {
  const pathParts = docRef.split('/');
  const collectionPath = pathParts.slice(0, -1).join('/');
  const docId = pathParts[pathParts.length - 1];
  const currentData = JSON.parse(localStorage.getItem(`firebase_mock_${collectionPath}`) || '[]');
  const docData = currentData.find((item: any) => item.id === docId);
  return { exists: () => !!docData, data: () => docData };
};

export const updateDoc = async (docRef: string, data: any) => setDoc(docRef, data, { merge: true });

export const deleteDoc = async (docRef: string) => {
  const pathParts = docRef.split('/');
  const collectionPath = pathParts.slice(0, -1).join('/');
  const docId = pathParts[pathParts.length - 1];

  const currentData = JSON.parse(localStorage.getItem(`firebase_mock_${collectionPath}`) || '[]');
  const newData = currentData.filter((item: any) => item.id !== docId);

  localStorage.setItem(`firebase_mock_${collectionPath}`, JSON.stringify(newData));
  notify(collectionPath);
};
