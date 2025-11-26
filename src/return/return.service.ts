// backend/src/return/return.service.ts
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

    // 2️⃣ Rental variables from RentService
    const allowedMinutes = txnData.duration;  // from RentService
    const initialFee = txnData.fee;           // user paid upfront

    // 3️⃣ Calculate usage
    const startMs = start.toMillis();
    const endMs = end.toMillis();

    const usedMinutes = Math.ceil((endMs - startMs) / (1000 * 60));
    let extraMinutes = usedMinutes - allowedMinutes;

    const gracePeriod = 5;
    if (extraMinutes <= gracePeriod) extraMinutes = 0;

    // 4️⃣ Fee calculations
    const ratePerMinute = initialFee / allowedMinutes;
    const additionalFee = Math.max(0, extraMinutes * ratePerMinute);
    const totalFee = initialFee + additionalFee;

    // 5️⃣ Get wallet balance
    const walletRef = userRef.collection('wallet').doc('balance');
    const walletSnap = await walletRef.get();
    const currentBalance = walletSnap.exists ? walletSnap.data()?.currentBalance || 0 : 0;

    if (currentBalance < additionalFee) {
      throw new Error('Insufficient wallet balance to return volt');
    }

    // 6️⃣ Batch updates
    const batch = firestore.batch();

    // Wallet update
    batch.update(walletRef, {
      currentBalance: currentBalance - additionalFee,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Update user transaction
    batch.update(txnDoc.ref, {
      status: 'completed',
      endTime: end,
      usedMinutes,
      allowedMinutes,
      extraMinutes,
      totalFee,
      additionalFee,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      type: 'return',
    });

    // Update global transaction
    const globalTxnRef = firestore.collection('transactions').doc(txnDoc.id);
    batch.update(globalTxnRef, {
      status: 'completed',
      endTime: end,
      usedMinutes,
      allowedMinutes,
      extraMinutes,
      totalFee,
      additionalFee,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      type: 'return',
    });

    // Volt reset
    const voltRef = firestore.collection('volts').doc(voltID);
    batch.update(voltRef, {
      status: 'available',
      studentUID: null,
      studentId: null,
      startTime: null,
      reservedAt: null,
    });

    // Remove from currentVolts list
    batch.update(userRef, {
      currentVolts: admin.firestore.FieldValue.arrayRemove(voltID),
    });

    // 7️⃣ Commit batch
    await batch.commit();

    return {
      message: 'Return confirmed',
      usedMinutes,
      allowedMinutes,
      extraMinutes,
      totalFee,
      additionalFee,
      remainingBalance: currentBalance - additionalFee,
    };
  }
}
