// backend/src/rent/rent.service.ts
import { Injectable, BadRequestException } from '@nestjs/common';
import { firestore } from '../firebase/firebase.admin';
import * as admin from 'firebase-admin';

export interface RentDto {
  voltID: string;
  fee: number;
  duration: number;   // ⭐ ADDED
}

@Injectable()
export class RentService {
  async confirmRent(studentUID: string, studentId: string, voltID: string, fee: number, duration: number) {
    if (!voltID) throw new Error('Missing volt ID');

    const batch = firestore.batch();
    const startTime = admin.firestore.Timestamp.now();
    const txnRef = firestore.collection('transactions').doc();
    const userTxnRef = firestore.collection('users').doc(studentUID).collection('transactions').doc(txnRef.id);
    const voltRef = firestore.collection('volts').doc(voltID);
    const userRef = firestore.collection('users').doc(studentUID);
    const walletRef = userRef.collection('wallet').doc('balance');

    const walletSnap = await walletRef.get();
    const currentBalance = walletSnap.exists ? walletSnap.data()?.currentBalance || 0 : 0;

    if (currentBalance < fee) {
      throw new BadRequestException('Insufficient wallet balance');
    }

    const txnData = {
      type: 'rent',
      status: 'active',
      startTime,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      fee,
      duration,
      voltID,
      studentUID,
      studentId,
    };

    batch.update(walletRef, {
      currentBalance: currentBalance - fee,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    batch.set(txnRef, txnData);
    batch.set(userTxnRef, txnData);

    batch.update(voltRef, { status: 'rented', studentUID, studentId, startTime, duration, });
    batch.update(userRef, { currentVolts: admin.firestore.FieldValue.arrayUnion(voltID) });

    await batch.commit();
    return { message: 'Rent confirmed', transactionId: txnRef.id, remainingBalance: currentBalance - fee };
  }
}

