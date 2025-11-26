import admin from '../firebase/firebase.admin';

const uid = 'YRtkEqHVDKhgZA3AQwXUMsAMuRm2';// 👈 Replace with your Firebase UID

async function setAdmin() {
  try {
    await admin.auth().setCustomUserClaims(uid, { role: 'admin' });
    console.log('✅ Admin role assigned for UID:', uid);
  } catch (error) {
    console.error('❌ Failed to set admin:', error);
  } finally {
    process.exit(0);
  }
}

setAdmin();
