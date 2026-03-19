/**
 * firebase-config.js — IGNIS Firebase Configuration
 *
 * ❗ STEP 1: Replace the values below with your own Firebase project config.
 *    Get these from: Firebase Console → Your Project → Project Settings → Your Apps
 *
 * ❗ STEP 2: After filling this in, open setup.html in your browser ONCE
 *    to create all user accounts and seed the database.
 */

const firebaseConfig = {
  apiKey: "AIzaSyA2dLod_jEOvPg8KOsCfTJM5-1d5GFTix4",
  authDomain: "fire-4a89b.firebaseapp.com",
  projectId: "fire-4a89b",
  storageBucket: "fire-4a89b.firebasestorage.app",
  messagingSenderId: "1057761465078",
  appId: "1:1057761465078:web:cd7f3543b800bd6dd0d2d7"
};

// Primary app — used for the admin's own login session
firebase.initializeApp(firebaseConfig);

// Secondary app — used ONLY to create new Auth accounts
// without disturbing the admin's login session
const secondaryApp  = firebase.initializeApp(firebaseConfig, 'secondary');

// Global handles used by db.js, auth.js, app.js
const db            = firebase.firestore();
const auth          = firebase.auth();
const secondaryAuth = secondaryApp.auth();
