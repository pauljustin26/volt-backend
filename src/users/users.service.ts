// backend/src/users/users.service.ts
import { Injectable } from '@nestjs/common';
import { firestore } from '../firebase/firebase.admin';
import * as admin from 'firebase-admin';

@Injectable()
export class UsersService {
  private usersCollection = firestore.collection('users');

  /**
   * Initialize user in Firestore after first login
   */
  async initializeUser(uid: string, email: string) {
    const userRef = this.usersCollection.doc(uid);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      const batch = firestore.batch();

      const userData = {
        uid,
        email,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        firstName: '',
        lastName: '',
        studentId: '',
        currentVolts: [],
      };

      // Wallet reference
      const walletRef = userRef.collection('wallet').doc('balance');

      batch.set(userRef, userData);
      batch.set(walletRef, {
        currentBalance: 0,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      await batch.commit();

      return { message: 'User initialized successfully', uid, email };
    }

    return { message: 'User already exists', uid, email };
  }

  /**
   * Fetch user profile + wallet balance
   */
  async getUserProfile(uid: string) {
    const userRef = this.usersCollection.doc(uid);
    const userSnap = await userRef.get();

    if (!userSnap.exists) throw new Error('User not found');
    const userData = userSnap.data();

    // Fetch wallet balance
    const walletRef = userRef.collection('wallet').doc('balance');
    const walletSnap = await walletRef.get();

    const walletData = walletSnap.exists
      ? walletSnap.data()
      : { currentBalance: 0 };

    return { ...userData, wallet: walletData };
  }

  /**
   * Update user profile info (firstName, lastName, email, studentId, etc.)
   */
  async updateUserProfile(uid: string, updates: any) {
    const allowedFields = ['firstName', 'lastName', 'email', 'studentId'];
    const filteredUpdates: any = {};

    for (const key of allowedFields) {
      if (updates[key] !== undefined) filteredUpdates[key] = updates[key];
    }

    if (Object.keys(filteredUpdates).length === 0) {
      throw new Error('No valid fields to update');
    }

    const userRef = this.usersCollection.doc(uid);

    await userRef.update({
      ...filteredUpdates,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { message: 'User profile updated successfully', updates: filteredUpdates };
  }
}
