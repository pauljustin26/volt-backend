// backend/src/rent/rent.service.ts
import { Injectable, BadRequestException } from '@nestjs/common';
import { firestore } from '../firebase/firebase.admin';
import * as admin from 'firebase-admin';

export interface RentDto {
  voltID: string;
  fee: number;
  duration: number;
}

@Injectable()
export class RentService {
  async confirmRent(studentUID: string, studentId: string, voltID: string, fee: number, duration: number) {
    if (!voltID) throw new Error('Missing volt ID');

    // --- 1. DETERMINE MINIMUM REQUIRED BALANCE ---
    // Rule: 
    // 30 min & 1 hour (<= 60 mins) -> Min Balance ₱55
    // 2 hours & 3 hours (> 60 mins) -> Min Balance ₱100
    // Test (1 min) -> Let's default to 55 for safety, or just the fee. 
    // Below logic treats 1 min as the lower tier.
    
    let requiredMinBalance = 0;

    if (duration <= 60) {
        requiredMinBalance = 55;
    } else {
        requiredMinBalance = 100;
    }

    const batch = firestore.batch();
    const startTime = admin.firestore.Timestamp.now();
    const txnRef = firestore.collection('transactions').doc();
    const userTxnRef = firestore.collection('users').doc(studentUID).collection('transactions').doc(txnRef.id);
    const voltRef = firestore.collection('volts').doc(voltID);
    const userRef = firestore.collection('users').doc(studentUID);
    const walletRef = userRef.collection('wallet').doc('balance');

    const walletSnap = await walletRef.get();
    const currentBalance = walletSnap.exists ? walletSnap.data()?.currentBalance || 0 : 0;

    // --- 2. CHECK BOTH FEE AND MINIMUM REQUIREMENT ---
    if (currentBalance < fee) {
      throw new BadRequestException(`Insufficient funds. Fee is ₱${fee}.`);
    }

    if (currentBalance < requiredMinBalance) {
        throw new BadRequestException(`Insufficient balance. This plan requires a minimum wallet balance of ₱${requiredMinBalance}.`);
    }

    // ... (Rest of your existing logic for batch updates is unchanged) ...

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