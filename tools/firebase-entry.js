// Point d'entrée pour construire js/vendor/firebase.js (voir tools/build-firebase.sh).
export { initializeApp } from 'firebase/app';
export {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signOut, sendPasswordResetEmail, updateProfile, connectAuthEmulator,
  indexedDBLocalPersistence, browserLocalPersistence, initializeAuth,
} from 'firebase/auth';
export {
  getFirestore, initializeFirestore, doc, setDoc, deleteDoc, collection, getDocs, onSnapshot, runTransaction,
  serverTimestamp, connectFirestoreEmulator,
} from 'firebase/firestore';
