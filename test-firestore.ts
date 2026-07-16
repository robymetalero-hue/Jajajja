import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, limit, query } from 'firebase/firestore';
import fs from 'fs';

const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId);

async function run() {
  try {
    const snap = await getDocs(query(collection(db, 'users'), limit(1)));
    console.log('Success, docs:', snap.size);
  } catch (err) {
    console.error('Error:', err.message);
  }
}
run();
