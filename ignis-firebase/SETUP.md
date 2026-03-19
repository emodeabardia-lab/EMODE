# IGNIS — Firebase Setup Guide

Follow these steps **once** to get IGNIS running with a real backend.
Total time: ~15 minutes.

---

## Step 1 — Create a Firebase Project

1. Go to **https://console.firebase.google.com**
2. Click **"Add project"**
3. Name it `ignis-fire-management` (or anything you like)
4. Disable Google Analytics (not needed) → **Create project**

---

## Step 2 — Enable Email/Password Authentication

1. In the Firebase Console, click **Authentication** (left sidebar)
2. Click **"Get started"**
3. Under **Sign-in method**, click **Email/Password**
4. Toggle **Enable** → **Save**

---

## Step 3 — Create a Firestore Database

1. Click **Firestore Database** (left sidebar)
2. Click **"Create database"**
3. Choose **"Start in test mode"** (you'll tighten rules later)
4. Pick a server location close to Greece → **Done**

---

## Step 4 — Get Your Firebase Config

1. Click the **gear icon** → **Project settings**
2. Scroll down to **"Your apps"** section
3. Click the **`</>`** (Web) icon to add a web app
4. Name it `ignis` → **Register app**
5. You'll see a config object like this:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "ignis-fire.firebaseapp.com",
  projectId: "ignis-fire",
  storageBucket: "ignis-fire.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

6. Open **`js/firebase-config.js`** in VS Code
7. Replace the placeholder values with your actual values
8. Save the file

---

## Step 5 — Run the Setup Tool

1. Open the `ignis/` folder and double-click **`setup.html`**
   *(or serve it with Live Server in VS Code)*
2. Click **"Run Setup"**
3. Watch the log — it will create all 11 user accounts and seed the database
4. It automatically redirects you to the login page when done

---

## Step 6 — Tighten Firestore Security Rules

After setup is complete, go to **Firestore → Rules** and replace the default rules with:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Users can only read their own profile
    match /users/{uid} {
      allow read: if request.auth.uid == uid;
      allow write: if false; // only writable by setup tool
    }

    // Authenticated users can read all data
    // Only admins (checked via their users doc) can write
    match /firefighters/{docId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }

    // Firefighters can update their OWN record (phone, certs, status)
    match /firefighters/{docId} {
      allow update: if request.auth != null &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.ffId == int(docId);
    }

    match /incidents/{docId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }

    match /units/{docId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }

    match /config/{docId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }
  }
}
```

Click **Publish**.

---

## Step 7 — Deploy (So Your Men Can Access It)

The easiest free option is **Netlify**:

1. Go to **https://app.netlify.com** → Sign up free
2. Drag and drop your entire `ignis/` folder onto the Netlify dashboard
3. You'll get a URL like `https://ignis-abc123.netlify.app`
4. Share that URL with your team — they can log in from any device

---

## Login Credentials (after setup)

| Username | Password | Role |
|---|---|---|
| `admin` | `admin2026` | Full access |
| `alexandros` | `ff1` | My Profile only |
| `dimitrios` | `ff2` | My Profile only |
| `nikos` | `ff3` | My Profile only |
| `eirini` | `ff4` | My Profile only |
| `petros` | `ff5` | My Profile only |
| `stavros` | `ff6` | My Profile only |
| `maria` | `ff7` | My Profile only |
| `kostas` | `ff8` | My Profile only |
| `yiannis` | `ff9` | My Profile only |
| `sophia` | `ff10` | My Profile only |

---

## File Structure

```
ignis/
├── index.html          ← Login page
├── dashboard.html      ← Main protected app
├── setup.html          ← Run ONCE to seed the database
├── SETUP.md            ← This guide
├── css/
│   └── styles.css      ← All styles
└── js/
    ├── firebase-config.js  ← ⬅ YOUR FIREBASE CREDENTIALS GO HERE
    ├── db.js           ← Firestore real-time operations
    ├── auth.js         ← Firebase Authentication
    └── app.js          ← All UI logic
```

---

## Changing Admin Password

Go to **Firebase Console → Authentication → Users**, find `admin@ignis.local`,
click the three-dot menu → **Reset password** or **Edit user**.

## Adding a New Firefighter

1. Log in as admin
2. Add them via the Roster page as normal
3. Then go to **Firebase Console → Authentication → Add user** and create:
   - Email: `{firstname}@ignis.local`
   - Password: `ff{id}` (or any password you choose)
4. Then manually add their Firestore profile under `users/{uid}`:
   ```json
   { "role": "firefighter", "ffId": 11, "name": "Name Surname" }
   ```
---
*IGNIS — Built with Firebase + plain HTML/CSS/JS*
