// backend/src/auth/auth.controller.ts

import {
  Body,
  Controller,
  Post,
  Get,
  Req,
  UseGuards,
  BadRequestException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { FirebaseAuthGuard } from './firebase-auth.guard';
import { Request } from 'express';
import admin, { firestore } from '../firebase/firebase.admin';
import { StudentsService } from '../students/students.service';

interface AuthRequest extends Request {
  user?: any;
}

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);
  constructor(private readonly studentsService: StudentsService) {}

  // ---------------- INIT USER (Fixed with Cleanup) ----------------
  @UseGuards(FirebaseAuthGuard)
  @Post('init')
  async initUser(@Req() req: AuthRequest, @Body() body: any) {
    const { uid, email } = req.user;
    
    const { 
      firstName = '', 
      lastName = '', 
      studentId = '', 
      mobileNumber = '',
      termsAccepted = false,
      termsAcceptedAt = null
    } = body ?? {};

    // 0. Check if this is an existing user (Safety Check)
    // We check this FIRST so we know if we should delete the account on error.
    const userRef = firestore.collection('users').doc(uid);
    const userDoc = await userRef.get();
    const isNewUser = !userDoc.exists;

  // --- Helper to Clean Up Auth if Validation Fails ---
    const rejectRegistration = async (message: string) => {
      if (isNewUser) {
        this.logger.warn(`Registration failed for ${email}: ${message}. Deleting Auth user.`);
        try {
          await admin.auth().deleteUser(uid);
        } catch (cleanupError: any) { // <--- FIX: Added ': any'
          this.logger.error(`Failed to cleanup auth user ${uid}: ${cleanupError.message}`);
        }
      }
      throw new BadRequestException(message);
    };
    // ---------------------------------------------------

    if (!studentId) {
      // If they didn't provide an ID, we just block the request, 
      // but we don't delete the account yet (give them a chance to retry).
      throw new BadRequestException('Student ID is required.');
    }

    // 1. Fetch official student records
    const studentInfo = await this.studentsService.getStudentInfo(studentId);

    // Check if ID exists in whitelist
    if (!studentInfo) {
      await rejectRegistration('Student ID not found in official records.');
    }

    // [SECURITY FIX] Check if the email matches
    const officialEmail = studentInfo.email || '';
    if (officialEmail.trim().toLowerCase() !== email.trim().toLowerCase()) {
       await rejectRegistration(
         `The email does not match the official records for Student ID.`
       );
    }

    // 2. Ensure the student ID isn’t already used by ANOTHER account
    const existingStudent = await firestore
      .collection('users')
      .where('studentId', '==', studentId)
      .get();

    if (!existingStudent.empty) {
      const conflictDoc = existingStudent.docs.find(doc => doc.id !== uid);
      if (conflictDoc) {
        await rejectRegistration('Student ID is already linked to another account.');
      }
    }

    // 3. Create the User Profile in Firestore
    if (isNewUser) {
      this.logger.log(`Creating new user document for UID=${uid}`);

      await userRef.set({
        firstName: firstName || studentInfo.firstName || '',
        lastName: lastName || studentInfo.lastName || '',
        studentId,
        mobileNumber,
        email,
        role: 'user', 
        termsAccepted,
        termsAcceptedAt,
        currentVolts: [],
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      const walletRef = userRef.collection('wallet').doc('balance');
      await walletRef.set({
        currentBalance: 0,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      
    } else {
       this.logger.log(`User document exists, merging data...`);
       // Logic for existing users (if any)
    }

    const freshUserDoc = await userRef.get();
    const walletDoc = await userRef.collection('wallet').doc('balance').get();

    return {
      message: 'User initialized successfully',
      uid,
      email,
      userProfile: freshUserDoc.data() || {},
      wallet: walletDoc.exists ? walletDoc.data() : null,
    };
  }

  // ... (Keep the rest of your controller: checkStudent, getProfile, etc.) ...
  @Post('check-student')
  async checkStudent(@Body() body: { studentId: string; email?: string }) {
    const { studentId, email } = body;

    if (!studentId) {
      throw new BadRequestException('Student ID is required.');
    }

    const studentInfo = await this.studentsService.getStudentInfo(studentId);
    if (!studentInfo) {
        throw new BadRequestException('Student ID not found in official records.');
    }

    if (email) {
        const officialEmail = studentInfo.email || '';
        if (officialEmail.trim().toLowerCase() !== email.trim().toLowerCase()) {
            throw new BadRequestException(
                'This Student ID belongs to a different email address.'
            );
        }
    }

    const existingStudent = await firestore
      .collection('users')
      .where('studentId', '==', studentId)
      .get();

    if (!existingStudent.empty) {
      throw new BadRequestException(`Student ID is already linked to another account.`);
    }

    return { message: 'Student ID is valid and matches email.' };
  }

  // ---------------- GET PROFILE ----------------
  @UseGuards(FirebaseAuthGuard)
  @Get('me')
  async getProfile(@Req() req: AuthRequest) {
    const { uid } = req.user;

    const userRef = firestore.collection('users').doc(uid);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      throw new NotFoundException('User not found in Firestore');
    }

    const walletDoc = await userRef.collection('wallet').doc('balance').get();

    return {
      ...userDoc.data(),
      wallet: walletDoc.exists ? walletDoc.data() : null,
    };
  }

  // ---------------- CHECK IF EMAIL EXISTS ----------------
  @Post('check-email')
  async checkEmail(@Body() body: { email: string }) {
    const { email } = body;

    if (!email) {
      throw new BadRequestException('Email is required.');
    }

    const usersRef = firestore.collection('users');
    const snapshot = await usersRef.where('email', '==', email).limit(1).get();

    if (snapshot.empty) {
      throw new BadRequestException('Email not found.');
    }

    return { message: 'Email exists.' };
  }
}
