import { Injectable } from '@nestjs/common';
import { firestore } from '../firebase/firebase.admin';
import * as admin from 'firebase-admin';

@Injectable()
export class ReturnService {
  async confirmReturn(studentUID: string, voltID: string) {
    const userRef = firestore.collection('users').doc(studentUID);
    const userTxnsRef = userRef.collection('transactions');

    // 1️⃣ Locate active rent transaction for this volt
    const activeTxnQuery = await userTxnsRef
      .where('voltID', '==', voltID)
      .where('status', '==', 'active')
      .get();

    if (activeTxnQuery.empty) throw new Error('No active transaction found');

    const txnDoc = activeTxnQuery.docs[0];
    const txnData = txnDoc.data();

    const start = txnData.startTime;
    const end = admin.firestore.Timestamp.now();

    // 2️⃣ Get Rental Variables
    const allowedMinutes = txnData.duration; // e.g., 30 or 60 (Passed from Rent Service)
    
    // ⭐ CONFIGURATION
    const GRACE_PERIOD = 5;          // 5 Minutes grace period
    const PENALTY_PER_MINUTE = 5;    // ₱5.00 per overdue minute

    // 3️⃣ Calculate Usage
    const startMs = start.toMillis();
    const endMs = end.toMillis();
    const usedMinutes = Math.ceil((endMs - startMs) / (1000 * 60)); // Round up to nearest minute

    // 4️⃣ Calculate Penalty ONLY
    // We do NOT recalculate the initial fee. That is already paid.
    let overdueMinutes = 0;
    let penaltyFee = 0;

    // Check if they exceeded duration + grace period
    if (usedMinutes > (allowedMinutes + GRACE_PERIOD)) {
       // Logic: If they rented for 30, used 40. Overdue is 10.
       overdueMinutes = usedMinutes - allowedMinutes;
       penaltyFee = overdueMinutes * PENALTY_PER_MINUTE;
    }

    // 5️⃣ Check Wallet for Penalty
    const walletRef = userRef.collection('wallet').doc('balance');
    const walletSnap = await walletRef.get();
    const currentBalance = walletSnap.exists ? walletSnap.data()?.currentBalance || 0 : 0;

    // Only block return if they have a penalty and can't pay it
    if (penaltyFee > 0 && currentBalance < penaltyFee) {
      throw new Error(`Insufficient balance. Penalty fee is ₱${penaltyFee}. Please top up.`);
    }

    // 6️⃣ Batch Updates
    const batch = firestore.batch();

    // A. Deduct Penalty from Wallet (Only if there is a penalty)
    if (penaltyFee > 0) {
      batch.update(walletRef, {
        currentBalance: currentBalance - penaltyFee,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    // B. Update the specific Rent Transaction
    // We mark it as completed and add the return details
    const updateData = {
      status: 'completed',
      endTime: end,
      usedMinutes,
      allowedMinutes,
      overdueMinutes, // ⭐ Save how late they were
      penaltyFee,     // ⭐ Save the penalty amount
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      type: 'return', // Mark as returned
    };

    batch.update(txnDoc.ref, updateData);

    // C. Update Global Transaction Record
    const globalTxnRef = firestore.collection('transactions').doc(txnDoc.id);
    batch.update(globalTxnRef, updateData);

    // D. Make Volt Available Again
    const voltRef = firestore.collection('volts').doc(voltID);
    batch.update(voltRef, {
      status: 'available',
      studentUID: null,
      studentId: null,
      startTime: null,
      reservedAt: null,
      duration: null,
    });

    // E. Remove from User's Current Volts
    batch.update(userRef, {
      currentVolts: admin.firestore.FieldValue.arrayRemove(voltID),
    });

    // 7️⃣ Commit
    await batch.commit();

    return {
      message: penaltyFee > 0 ? 'Return confirmed with penalty' : 'Return confirmed',
      usedMinutes,
      allowedMinutes,
      overdueMinutes,
      penaltyFee,
      remainingBalance: currentBalance - penaltyFee,
    };
  }
}