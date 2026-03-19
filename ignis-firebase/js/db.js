/**
 * db.js - IGNIS Firestore Database Layer
 */

const DB = {

  firefighters: [],
  incidents:    [],
  units:        [],
  schedule:     {},
  certTypes:    [],   // admin-defined certification types

  unitKey: name => name.replace(/\s+/g, '_'),

  // ── Real-time listeners ──────────────────────────────────────────────────

  listenFirefighters(onChange) {
    return db.collection('firefighters').orderBy('id')
      .onSnapshot(snap => {
        this.firefighters = snap.docs.map(d => d.data());
        if (onChange) onChange(this.firefighters);
      }, err => console.error('FF listener:', err));
  },

  listenIncidents(onChange) {
    return db.collection('incidents').orderBy('createdAt', 'desc')
      .onSnapshot(snap => {
        this.incidents = snap.docs.map(d => d.data());
        if (onChange) onChange(this.incidents);
      }, err => console.error('Incidents listener:', err));
  },

  listenUnits(onChange) {
    return db.collection('units').orderBy('name')
      .onSnapshot(snap => {
        this.units = snap.docs.map(d => d.data());
        if (onChange) onChange(this.units);
      }, err => console.error('Units listener:', err));
  },

  listenSchedule(onChange) {
    return db.collection('config').doc('schedule')
      .onSnapshot(doc => {
        this.schedule = doc.exists ? doc.data() : {};
        if (onChange) onChange(this.schedule);
      }, err => console.error('Schedule listener:', err));
  },

  listenCertTypes(onChange) {
    return db.collection('config').doc('certTypes')
      .onSnapshot(doc => {
        this.certTypes = doc.exists ? (doc.data().list || []) : [];
        if (onChange) onChange(this.certTypes);
      }, err => console.error('CertTypes listener:', err));
  },

  // ── Cert Types (admin managed) ───────────────────────────────────────────

  async saveCertTypes(list) {
    await db.collection('config').doc('certTypes').set({ list });
    this.certTypes = list;
  },

  // ── Firefighter CRUD ─────────────────────────────────────────────────────

  async addFirefighter(ff) {
    await db.collection('firefighters').doc(String(ff.id)).set(ff);
  },

  async updateFirefighter(id, fields) {
    await db.collection('firefighters').doc(String(id)).update(fields);
  },

  async removeFirefighter(id) {
    await db.collection('firefighters').doc(String(id)).delete();
  },

  // ── Incident CRUD ────────────────────────────────────────────────────────

  async addIncident(inc) {
    const id  = await this.nextIncidentId();
    const doc = {
      ...inc,
      id,
      deployedUnits: inc.deployedUnits || [],
      log: [{
        time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
        msg:  'Incident created. Units dispatched: ' + (inc.deployedUnits || []).join(', ') || 'None',
      }],
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    };
    // Mark selected units as deployed
    const batch = db.batch();
    batch.set(db.collection('incidents').doc(id), doc);
    (inc.deployedUnits || []).forEach(unitName => {
      const key = this.unitKey(unitName);
      batch.update(db.collection('units').doc(key), { status: 'deployed' });
    });
    await batch.commit();
    return id;
  },

  async updateIncident(id, fields) {
    await db.collection('incidents').doc(id).update(fields);
  },

  async removeIncident(id) {
    await db.collection('incidents').doc(id).delete();
  },

  // Dispatch additional units to an active incident
  async dispatchUnitsToIncident(incidentId, unitNames) {
    const incRef = db.collection('incidents').doc(incidentId);
    const batch  = db.batch();

    const logEntry = {
      time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
      msg:  'Units dispatched: ' + unitNames.join(', '),
    };

    batch.update(incRef, {
      deployedUnits: firebase.firestore.FieldValue.arrayUnion(...unitNames),
      log:           firebase.firestore.FieldValue.arrayUnion(logEntry),
    });

    unitNames.forEach(name => {
      batch.update(db.collection('units').doc(this.unitKey(name)), { status: 'deployed' });
    });

    await batch.commit();
  },

  // Return units from incident back to base
  async returnUnitsFromIncident(incidentId, unitNames) {
    const incRef  = db.collection('incidents').doc(incidentId);
    const batch   = db.batch();
    const unitKey = name => name.replace(/\s+/g, '_');  // local ref avoids 'this' context issues

    const logEntry = {
      time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
      msg:  'Units returned to base: ' + unitNames.join(', '),
    };

    batch.update(incRef, {
      deployedUnits: firebase.firestore.FieldValue.arrayRemove(...unitNames),
      log:           firebase.firestore.FieldValue.arrayUnion(logEntry),
    });

    // Set each returned unit back to available
    unitNames.forEach(name => {
      batch.update(db.collection('units').doc(unitKey(name)), { status: 'available' });
    });

    await batch.commit();
  },

  // ── Unit CRUD ────────────────────────────────────────────────────────────

  async addUnit(unit) {
    await db.collection('units').doc(this.unitKey(unit.name)).set(unit);
  },

  async updateUnit(name, fields) {
    await db.collection('units').doc(this.unitKey(name)).update(fields);
  },

  async removeUnit(name) {
    await db.collection('units').doc(this.unitKey(name)).delete();
  },

  // ── Schedule ─────────────────────────────────────────────────────────────

  async updateShift(personName, dayIndex, newShift) {
    await db.collection('config').doc('schedule').update({
      [personName + '.' + dayIndex]: newShift,
    });
  },

  // ── Incident counter ─────────────────────────────────────────────────────

  async nextIncidentId() {
    const ref = db.collection('config').doc('counters');
    const id  = await db.runTransaction(async t => {
      const doc     = await t.get(ref);
      const current = doc.exists ? (doc.data().incCounter || 848) : 848;
      t.set(ref, { incCounter: current + 1 }, { merge: true });
      return 'INC-2026-0' + current;
    });
    return id;
  },

  // ── Incident Chat ────────────────────────────────────────────────────────────

  // Send a message to an incident's chat
  async sendChatMessage(incidentId, senderName, text) {
    await db.collection('incidents').doc(incidentId)
      .collection('chat').add({
        sender: senderName,
        text:   text.trim(),
        time:   new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
  },

  // Listen to chat messages for an incident in real time
  listenChat(incidentId, onChange) {
    return db.collection('incidents').doc(incidentId)
      .collection('chat')
      .orderBy('createdAt', 'asc')
      .onSnapshot(snap => {
        const messages = snap.docs.map(d => d.data());
        if (onChange) onChange(messages);
      }, err => console.error('Chat listener:', err));
  },

  // Delete all chat messages when incident is resolved
  async deleteChat(incidentId) {
    const snap = await db.collection('incidents').doc(incidentId)
      .collection('chat').get();
    const batch = db.batch();
    snap.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
  },

  // ── Create Firebase Auth account for new firefighter ─────────────────────
  // Uses secondary app so admin session is never interrupted

  async createUserAccount(ff) {
    const email    = ff.first.toLowerCase() + '.' + ff.last.toLowerCase() + '@ignis.local';
    const password = 'ignis' + ff.id;

    const cred = await secondaryAuth.createUserWithEmailAndPassword(email, password);
    const uid  = cred.user.uid;
    await secondaryAuth.signOut();

    await db.collection('users').doc(uid).set({
      role:  'firefighter',
      ffId:  ff.id,
      name:  ff.first + ' ' + ff.last,
      email: email,
    });

    return { uid, email, password };
  },

};
