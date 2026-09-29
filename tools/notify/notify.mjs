// Envoi des rappels : lancé toutes les heures par GitHub Actions.
// Pour chaque compte ayant activé les notifications, relit ses données dans
// Firestore, calcule les rappels dus (js/reminders.js) et les envoie en Web Push.
//
// Variables d'environnement :
//   FIREBASE_SERVICE_ACCOUNT  JSON du compte de service Firebase (secret GitHub)
//   VAPID_PRIVATE_KEY         clé privée VAPID (secret GitHub)
//   TEST=1                    envoie une notification de test à tous les appareils
//   DRY_RUN=1                 n'envoie rien, affiche seulement
//   FIRESTORE_EMULATOR_HOST   pour tester avec l'émulateur Firestore
import admin from 'firebase-admin';
import webpush from 'web-push';
import { fromChunks } from '../../js/store.js';
import { dueReminders, localNow } from '../../js/reminders.js';
import { vapidPublicKey } from '../../js/push-config.js';

const DRY = process.env.DRY_RUN === '1';
const TEST = process.env.TEST === '1' || process.env.TEST === 'true';

if (process.env.FIRESTORE_EMULATOR_HOST) {
  admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'demo-seche' });
} else {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    // Pas encore configuré : on s'arrête sans erreur (évite un e-mail d'échec toutes les heures).
    console.log('::warning::Secret FIREBASE_SERVICE_ACCOUNT manquant : notifications non configurées (voir docs/notifications.html).');
    process.exit(0);
  }
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
}
if (!DRY) {
  if (!process.env.VAPID_PRIVATE_KEY) {
    console.log('::warning::Secret VAPID_PRIVATE_KEY manquant : notifications non configurées (voir docs/notifications.html).');
    process.exit(0);
  }
  webpush.setVapidDetails('https://ambregly.github.io/Fitness/', vapidPublicKey, process.env.VAPID_PRIVATE_KEY.trim());
}
const db = admin.firestore();

const dead = new Set(); // abonnements expirés pendant ce passage

async function send(subDoc, payload) {
  const { subscription } = subDoc.data();
  if (DRY) { console.log('  [simulation] →', payload.title, '|', payload.body); return true; }
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload), { TTL: 4 * 3600, urgency: 'normal' });
    return true;
  } catch (e) {
    if (e.statusCode === 404 || e.statusCode === 410) {
      console.log('  abonnement expiré, supprimé');
      await subDoc.ref.delete();
      dead.add(subDoc.id);
    } else {
      console.warn('  échec d’envoi', e.statusCode, e.body || e.message);
    }
    return false;
  }
}

const users = await db.collection('users').listDocuments();
let total = 0;
for (const userRef of users) {
  const subs = await userRef.collection('push').get();
  if (subs.empty) continue;
  const tz = subs.docs[0].data().tz || 'Europe/Paris';
  const { date, hour } = localNow(tz, process.env.NOW ? new Date(process.env.NOW) : new Date()); // NOW : pour les tests
  console.log(`Compte ${userRef.id.slice(0, 6)}… : ${subs.size} appareil(s), ${date} ${hour} h (${tz})`);

  let reminders;
  const metaRef = userRef.collection('meta').doc('notify');
  const lastSent = (await metaRef.get()).data()?.lastSent || {};
  if (TEST) {
    reminders = [{ kind: 'test', url: './', title: 'Notifications activées ✅', body: 'Tu recevras ici tes rappels de repas, de séance et de pesée.' }];
  } else {
    const ids = ['core', 'weights', `meals-${date.slice(0, 7)}`, `workouts-${date.slice(0, 4)}`];
    const snaps = await db.getAll(...ids.map((id) => userRef.collection('chunks').doc(id)));
    const map = {};
    for (const s of snaps) if (s.exists) map[s.id] = JSON.parse(s.data().json);
    if (!map.core) { console.log('  pas encore de données'); continue; }
    reminders = dueReminders(fromChunks(map), date, hour, lastSent);
  }
  for (const r of reminders) {
    let ok = false;
    for (const sub of subs.docs.filter((d) => !dead.has(d.id))) ok = (await send(sub, { title: r.title, body: r.body, url: r.url, tag: r.kind })) || ok;
    console.log(`  ${r.kind} : ${ok ? 'envoyé' : 'non envoyé'}`);
    if (ok && r.kind !== 'test') lastSent[r.kind] = date;
    total += ok ? 1 : 0;
  }
  if (!DRY && reminders.length) await metaRef.set({ lastSent, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
}
console.log(`Terminé : ${total} rappel(s) envoyé(s).`);
