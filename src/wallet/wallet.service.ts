import { Injectable, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { firestore, bucket } from '../firebase/firebase.admin';
import { v4 as uuidv4 } from 'uuid';
import { Timestamp } from 'firebase-admin/firestore';

@Injectable()
export class GcashService {
  // ---------------- USER ----------------
  async uploadReceipt(userUID: string, amount: number, file: Express.Multer.File) {
    if (!file?.buffer) throw new BadRequestException('No receipt uploaded');
    if (!amount || amount <= 0) throw new BadRequestException('Invalid amount');

    try {
      const fileName = `gcash_receipts/${userUID}_${Date.now()}_${uuidv4()}.jpg`;
      const fileRef = bucket.file(fileName);

      // ✅ Generate a download token
      const downloadToken = uuidv4();

      await fileRef.save(file.buffer, {
        metadata: {
          contentType: file.mimetype,
          metadata: { firebaseStorageDownloadTokens: downloadToken },
        },
      });

      // ✅ Include the token in the URL
      const receiptURL = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(
        fileName,
      )}?alt=media&token=${downloadToken}`;

      const transactionId = `gcash_${userUID}_${Date.now()}`;
      const transaction = {
        userId: userUID,
        amount,
        status: 'pending',
        type: 'topup',
        method: 'gcash-manual',
        receiptURL: `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(fileName)}?alt=media&token=${downloadToken}`,
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
      throw new InternalServerErrorException('Failed to upload GCash receipt');
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
        .where('method', '==', 'gcash-manual')
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
