// Usage: node scripts/set-admin.js <uid>
// Requires: serviceAccountKey.json in project root (DO NOT commit this file)

const admin = require('firebase-admin');
const path = require('path');

const uid = process.argv[2];
if (!uid) {
  console.error('Usage: node scripts/set-admin.js <firebase-uid>');
  process.exit(1);
}

const serviceAccountPath = path.join(__dirname, '..', 'serviceAccountKey.json');
try {
  const serviceAccount = require(serviceAccountPath);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
} catch (e) {
  console.error('Missing serviceAccountKey.json in project root.');
  console.error('Download it from: Firebase Console > Project Settings > Service Accounts > Generate New Private Key');
  process.exit(1);
}

admin.auth().setCustomUserClaims(uid, { admin: true })
  .then(() => {
    console.log(`Admin claim set for UID: ${uid}`);
    console.log('Sign out and back in for it to take effect.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Failed to set admin claim:', err.message);
    process.exit(1);
  });
