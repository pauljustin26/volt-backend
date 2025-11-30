import { Injectable, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { firestore, bucket } from '../firebase/firebase.admin';
import { v4 as uuidv4 } from 'uuid';
import { Timestamp } from 'firebase-admin/firestore';
import axios from 'axios';

@Injectable()
export class GcashService {
  // ---------------- PAYMONGO (Online) ----------------
  async createTopUp(userId: string, amount: number, redirectBaseUrl: string) { 
    try {
      const PAYMONGO_SECRET_KEY = process.env.PAYMONGO_SECRET_KEY;
      if (!PAYMONGO_SECRET_KEY) throw new Error('PayMongo config missing');

      // 1. Define Success/Cancel URLs dynamically
      // If web (localhost:8081), this becomes http://localhost:8081/wallet/status...
      // If mobile, we can use a deep link or the same logic if handled correctly
      console.log("------------------------------------------------");
      console.log("Incoming Redirect Base URL:", redirectBaseUrl);
      
      const successUrl = `${redirectBaseUrl}/wallet/status?status=succeeded&amount=${amount}&method=paymongo`;
      const cancelUrl = `${redirectBaseUrl}/wallet/recharge?status=cancelled`;
      
      console.log("Generated Success URL:", successUrl);
      console.log("Generated Cancel URL:", cancelUrl);
      console.log("------------------------------------------------");

      const response = await axios.post(
        'https://api.paymongo.com/v1/checkout_sessions',
        {
          data: {
            attributes: {
              // ... existing line items ...
              line_items: [
                {
                  currency: 'PHP',
                  amount: amount * 100,
                  description: 'Recharge Wallet',
                  name: 'Wallet',
                  quantity: 1,
                },
              ],
              payment_method_types: ['gcash', 'paymaya', 'card', 'grab_pay'],
              send_email_receipt: false,
              show_description: true,
              show_line_items: true,
              reference_number: `TOPUP-${userId}-${Date.now()}`,
              
              // ⭐ USE THE DYNAMIC URLS
              success_url: successUrl,
              cancel_url: cancelUrl,
              
              description: 'transaction',
              metadata: {
                userId: userId,
                type: 'topup',
              },
            },
          },
        },
        // ... headers ...
        {
          headers: {
            Authorization: `Basic ${Buffer.from(PAYMONGO_SECRET_KEY + ':').toString('base64')}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
        },
      );
      
      // ... return response
      const session = response.data.data;
      return {
        checkoutUrl: session.attributes.checkout_url,
        sessionId: session.id,
      };
    } catch (err: any) {
      // ... error handling
      throw new InternalServerErrorException('Failed to initialize payment');
    }
  }

  // ---------------- PAYMONGO WEBHOOK HANDLER ----------------
  // Renamed to 'addBalance' to match WalletController's call
  async addBalance(userId: string, amount: number, transactionId: string) {
    console.log(`Processing PayMongo success for ${userId}: ₱${amount}`);
    
    const userRef = firestore.collection('users').doc(userId);
    const balanceRef = userRef.collection('wallet').doc('balance');
    
    // Use the PayMongo Transaction ID (e.g. pay_...) as the Document ID
    const txnRef = firestore.collection('transactions').doc(transactionId);

    await firestore.runTransaction(async (t) => {
      const balanceDoc = await t.get(balanceRef);
      const currentBalance = balanceDoc.exists ? balanceDoc.data()?.currentBalance || 0 : 0;
      
      const newBalance = currentBalance + amount;

      // 1. Update Wallet Balance
      t.set(balanceRef, { currentBalance: newBalance, updatedAt: Timestamp.now() }, { merge: true });

      // Create Transaction Record Data
      const txnData = {
        userId,
        amount,
        status: 'succeeded',
        type: 'topup',
        method: 'paymongo',
        createdAt: new Date(),
        completedAt: new Date(),
        referenceId: transactionId,
        description: 'Recharge Wallet via PayMongo',
      };

      // 2. Save to Global Transactions
      t.set(txnRef, txnData);

      // 3. Save to User's Transactions Subcollection
      t.set(userRef.collection('transactions').doc(transactionId), txnData);
    });
    
    console.log(`Successfully added ₱${amount} to ${userId}`);
  }

  // ---------------- MANUAL UPLOAD (Existing) ----------------
  async uploadReceipt(userUID: string, amount: number, file: Express.Multer.File, method?: string) {
    if (!file?.buffer) throw new BadRequestException('No receipt uploaded');
    if (!amount || amount <= 0) throw new BadRequestException('Invalid amount');

    // Clean method string
    let cleanMethod = (method || 'gcash').toLowerCase();
    cleanMethod = cleanMethod.replace(/-manual|_manual/g, ''); 

    try {
      const fileName = `${cleanMethod}_receipts/${userUID}_${Date.now()}_${uuidv4()}.jpg`;
      const fileRef = bucket.file(fileName);
      const downloadToken = uuidv4();

      await fileRef.save(file.buffer, {
        metadata: {
          contentType: file.mimetype,
          metadata: { firebaseStorageDownloadTokens: downloadToken },
        },
      });

      const receiptURL = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(
        fileName,
      )}?alt=media&token=${downloadToken}`;

      const transactionId = `${cleanMethod}_${userUID}_${Date.now()}`;
      
      const transaction = {
        userId: userUID,
        amount,
        status: 'pending',
        type: 'topup',
        method: `${cleanMethod}_manual`, 
        receiptURL,
        receiptPath: fileName,
        createdAt: new Date(),
        completedAt: null,
      };

      await Promise.all([
        firestore
          .collection('users')
          .doc(userUID)
          .collection('transactions')
          .doc(transactionId)
          .set(transaction),
        firestore.collection('transactions').doc(transactionId).set(transaction),
      ]);

      return { transactionId, userUID, amount, receiptURL };
    } catch (err: any) {
      console.error('GcashService.uploadReceipt error:', err);
      throw new InternalServerErrorException('Failed to upload receipt');
    }
  }

  async getUserDoc(uid: string) {
    const doc = await firestore.collection('users').doc(uid).get();
    return doc.exists ? doc.data() : null;
  }

  // ---------------- ADMIN ----------------
  async listPending() {
    try {
      const snap = await firestore
        .collection('transactions')
        .where('method', 'in', ['gcash_manual', 'maya_manual'])
        .where('status', '==', 'pending')
        .orderBy('createdAt', 'desc')
        .get();

      return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    } catch (err) {
      console.error(err);
      throw new InternalServerErrorException('Failed to fetch pending receipts');
    }
  }

  async approve(transactionId: string) {
    const ref = firestore.collection('transactions').doc(transactionId);
    const doc = await ref.get();

    if (!doc.exists) throw new BadRequestException('Transaction not found');

    const tx = doc.data() as any;
    if (!tx) throw new BadRequestException('Transaction data missing');
    if (tx.status === 'succeeded') return { message: 'Already approved' };

    const userRef = firestore.collection('users').doc(tx.userId);
    const balanceRef = userRef.collection('wallet').doc('balance');

    await firestore.runTransaction(async (t) => {
      const balanceDoc = await t.get(balanceRef);
      const currentBalance = balanceDoc.exists ? balanceDoc.data()?.currentBalance || 0 : 0;
      const newBalance = currentBalance + tx.amount;

      t.set(balanceRef, { currentBalance: newBalance, updatedAt: Timestamp.now() }, { merge: true });
      t.update(ref, { status: 'succeeded', completedAt: Timestamp.now() });
      t.update(userRef.collection('transactions').doc(transactionId), {
        status: 'succeeded',
        completedAt: Timestamp.now(),
      });
    });

    return { message: 'Transaction approved successfully' };
  }

  async deny(transactionId: string) {
    const ref = firestore.collection('transactions').doc(transactionId);
    const doc = await ref.get();

    if (!doc.exists) throw new BadRequestException('Transaction not found');

    const tx = doc.data() as any;
    if (tx.status !== 'pending') throw new BadRequestException('Only pending transactions can be denied');

    await ref.update({
      status: 'denied',
      completedAt: Timestamp.now(),
    });

    await firestore
      .collection('users')
      .doc(tx.userId)
      .collection('transactions')
      .doc(transactionId)
      .update({
        status: 'denied',
        completedAt: Timestamp.now(),
      });

    return { message: 'Transaction denied successfully' };
  }
}