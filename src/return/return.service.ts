import { Injectable, BadRequestException } from '@nestjs/common';
import { firestore } from '../firebase/firebase.admin';
import * as admin from 'firebase-admin';

@Injectable()
export class ReturnService {
  async confirmReturn(studentUID: string, voltID: string) {
    const userRef = firestore.collection('users').doc(studentUID);
    const userTxnsRef = userRef.collection('transactions');

    // --- 0. CHECK SENSOR STATUS FIRST ---
    const voltRef = firestore.collection('volts').doc(voltID);
    const voltDoc = await voltRef.get();

    if (!voltDoc.exists) {
        throw new BadRequestException('Volt ID not found.');
    }

    const voltData = voltDoc.data();
    // Verify it is physically returned
    if (voltData?.sensorStatus !== 'CHARGING') {
        throw new BadRequestException('Device not detected in slot. Please insert the powerbank properly.');
    }

    // 1️⃣ Locate active rent transaction
    const activeTxnQuery = await userTxnsRef
      .where('voltID', '==', voltID)
      .where('status', '==', 'active')
      .get();

    if (activeTxnQuery.empty) throw new BadRequestException('No active transaction found for this Volt.');

    const txnDoc = activeTxnQuery.docs[0];
    const txnData = txnDoc.data();

    const start = txnData.startTime;
    const end = admin.firestore.Timestamp.now();

    // 2️⃣ Get Rental Variables
    const allowedMinutes = txnData.duration; 
    
    // ⭐ CONFIGURATION
    const GRACE_PERIOD = 5;          
    const PENALTY_PER_MINUTE = 5;    

    // 3️⃣ Calculate Usage
    const startMs = start.toMillis();
    const endMs = end.toMillis();
    const usedMinutes = Math.ceil((endMs - startMs) / (1000 * 60)); 

    // 4️⃣ Calculate Penalty
    let overdueMinutes = 0;
    let penaltyFee = 0;

    if (usedMinutes > (allowedMinutes + GRACE_PERIOD)) {
       overdueMinutes = usedMinutes - allowedMinutes;
       penaltyFee = overdueMinutes * PENALTY_PER_MINUTE;
    }

    // 5️⃣ Check Wallet & Calculate Debt
    const walletRef = userRef.collection('wallet').doc('balance');
    const walletSnap = await walletRef.get();
    
    const walletData = walletSnap.exists ? walletSnap.data() : {};
    
    // Ensure we don't treat existing negative balance as "spendable" money
    const rawBalance = walletData?.currentBalance || 0;
    const availableBalance = Math.max(0, rawBalance); 
    const existingDebt = walletData?.unpaidBalance || 0; 

    let amountPaid = 0;
    let newDebtAdded = 0;

    // --- DEBT LOGIC ---
    // If there is a penalty, try to pay it. 
    // If not enough funds, drain the wallet and add the rest to debt.
    if (penaltyFee > 0) {
        if (availableBalance >= penaltyFee) {
            // Case A: User has enough money
            amountPaid = penaltyFee;
            newDebtAdded = 0;
        } else {
            // Case B: User does NOT have enough money (or has 0)
            // We take whatever they have (draining wallet to 0)
            amountPaid = availableBalance; 
            // The rest becomes debt
            newDebtAdded = penaltyFee - availableBalance; 
        }
    }

    // 6️⃣ Batch Updates
    const batch = firestore.batch();

    // A. Update Wallet
    // New Balance = Old Balance - Amount Paid. 
    // If they were in debt (negative), this math keeps them negative or at 0 correctly.
    const newCurrentBalance = rawBalance - amountPaid;

    batch.update(walletRef, {
      currentBalance: newCurrentBalance, 
      unpaidBalance: existingDebt + newDebtAdded,  // Add to cumulative debt
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // B. Update Rent Transaction
    const updateData = {
      status: 'completed',
      endTime: end,
      usedMinutes,
      allowedMinutes,
      overdueMinutes, 
      penaltyFee,     
      amountPaid,      
      debtIncurred: newDebtAdded, 
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      type: 'return', 
    };

    batch.update(txnDoc.ref, updateData);

    // C. Update Global Transaction Record
    const globalTxnRef = firestore.collection('transactions').doc(txnDoc.id);
    batch.update(globalTxnRef, updateData);

    // D. Make Volt Available Again
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
      message: newDebtAdded > 0 
        ? `Return successful. Insufficient funds. ₱${newDebtAdded} added to unpaid balance.` 
        : 'Return confirmed successfully.',
      usedMinutes,
      penaltyFee,
      amountPaid,
      debtIncurred: newDebtAdded,
      remainingBalance: newCurrentBalance,
      totalUnpaidBalance: existingDebt + newDebtAdded
    };
  }
}