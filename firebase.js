// ============================================================
//  firebase.js — All Firebase logic for Beauty's Jewelry
//  ✅ Connected to: jewlry-website (Firebase project)
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getStorage,
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

// ─────────────────────────────────────────────────────────────
// ✅ YOUR FIREBASE CONFIG — jewlry-website project
// ─────────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey:            "AIzaSyB0MOW72xB9LcFY1yBHA6LfkPA2Wf8y6po",
  authDomain:        "jewlry-website.firebaseapp.com",
  projectId:         "jewlry-website",
  storageBucket:     "jewlry-website.firebasestorage.app",   // ✅ FIXED: (changed to firebasestorage.app)
  messagingSenderId: "325217591259",
  appId:             "1:325217591259:web:85aa30d70fb5590b8e11fe",
  measurementId:     "G-22M4KHY6P5"
};

// ── Initialise Firebase services ──────────────────────────────
const app     = initializeApp(firebaseConfig);
const auth    = getAuth(app);
const db      = getFirestore(app);
const storage = getStorage(app);

// ─────────────────────────────────────────────────────────────
// AUTH
// ─────────────────────────────────────────────────────────────

/** Sign the admin in with email + password */
export async function adminLogin(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

/** Sign the admin out */
export async function adminLogout() {
  return signOut(auth);
}

/** Watch login state — cb(user) when signed in, cb(null) when signed out */
export function onAuthChange(cb) {
  return onAuthStateChanged(auth, cb);
}

// ─────────────────────────────────────────────────────────────
// PRODUCTS — Firestore "products" collection
// ─────────────────────────────────────────────────────────────

/**
 * Fetch all products, newest first.
 * Falls back to unordered fetch if the Firestore index isn't built yet.
 */
export async function fetchProducts() {
  try {
    const q    = query(collection(db, "products"), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    // Firestore index not created yet — load without sort order instead of crashing
    if (err.code === "failed-precondition" || (err.message && err.message.includes("index"))) {
      console.warn("⚠️ Firestore index not ready — products loaded without sort order. Check the browser console error for a link to create the index automatically.");
      const snap = await getDocs(collection(db, "products"));
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }
    throw err; // re-throw real errors (e.g. permission-denied)
  }
}

/**
 * Add a new product to Firestore.
 * @param {Object} data — { name, category, price, oldPrice, badge, isNew, imageUrl, storagePath }
 */
export async function addProduct(data) {
  return addDoc(collection(db, "products"), {
    ...data,
    createdAt: serverTimestamp()
  });
}

/**
 * Update fields on an existing product.
 * @param {string} id   — Firestore document id
 * @param {Object} data — fields to update
 */
export async function updateProduct(id, data) {
  return updateDoc(doc(db, "products", id), data);
}

/**
 * Delete a product document and its Storage image.
 * @param {string} id          — Firestore document id
 * @param {string} storagePath — path in Firebase Storage (may be empty/null)
 */
export async function deleteProduct(id, storagePath) {
  await deleteDoc(doc(db, "products", id));
  if (storagePath) {
    try { await deleteObject(ref(storage, storagePath)); } catch (_) {}
  }
}

// ─────────────────────────────────────────────────────────────
// STORAGE — Upload a product image
// ─────────────────────────────────────────────────────────────

/**
 * Upload an image file to Firebase Storage.
 * @param {File}     file       — the selected image File
 * @param {Function} onProgress — called with 0–100 during upload
 * @returns {Promise<{url, path}>} — public download URL + storage path
 */
export async function uploadProductImage(file, onProgress) {
  const path       = `products/${Date.now()}_${file.name}`;
  const storageRef = ref(storage, path);
  const task       = uploadBytesResumable(storageRef, file);

  return new Promise((resolve, reject) => {
    task.on(
      "state_changed",
      snap => onProgress && onProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
      reject,
      async () => {
        const url = await getDownloadURL(task.snapshot.ref);
        resolve({ url, path });
      }
    );
  });
}