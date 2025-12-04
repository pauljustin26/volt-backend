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

  // ---------------- INIT USER (called after Firebase signup) ----------------
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

    if (!studentId) {
      throw new BadRequestException('Student ID is required.');
    }

    // 0. Double Check: Ensure valid student
    if (!this.studentsService.isValidStudent(studentId)) {
      throw new BadRequestException('Invalid student ID not found in list.');
    }

    // 1. Ensure the student ID isn’t already used
    const existingStudent = await firestore
      .collection('users')
      .where('studentId', '==', studentId)
      .get();

    if (!existingStudent.empty) {
      const conflictDoc = existingStudent.docs.find(doc => doc.id !== uid);
      if (conflictDoc) {
        throw new BadRequestException(
          `Student ID is already linked to another account.`
        );
      }
    }

    // 2. Prepare user reference
    const userRef = firestore.collection('users').doc(uid);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      this.logger.log(`Creating new user document for UID=${uid}`);

      const studentInfo = this.studentsService.getStudentInfo(studentId);

      await userRef.set({
        firstName: firstName || studentInfo?.firstName || '',
        lastName: lastName || studentInfo?.lastName || '',
        studentId,
        mobileNumber,
        email,
        role: 'user', // <--- FIX: AUTOMATICALLY ASSIGN ROLE HERE
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
      // Merge updates logic (omitted for brevity, keep your existing logic here)
       this.logger.log(`User document exists, merging...`);
       // ... existing update logic ...
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

  // ---------------- CHECK STUDENT ID BEFORE SIGNUP ----------------
  @Post('check-student')
  async checkStudent(@Body() body: { studentId: string }) {
    const { studentId } = body;

    if (!studentId) {
      throw new BadRequestException('Student ID is required.');
    }

    // --- FIX: Check if ID is in the CSV List FIRST ---
    if (!this.studentsService.isValidStudent(studentId)) {
        throw new BadRequestException('Student ID not found in official records.');
    }

    // Then check if it is already taken in Firestore
    const existingStudent = await firestore
      .collection('users')
      .where('studentId', '==', studentId)
      .get();

    if (!existingStudent.empty) {
      throw new BadRequestException(`Student ID is already linked to another account.`);
    }

    return { message: 'Student ID is valid and available.' };
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

  // ---------------- CHECK IF EMAIL EXISTS (For Password Reset) ----------------
  @Post('check-email')
  async checkEmail(@Body() body: { email: string }) {
    const { email } = body;

    if (!email) {
      throw new BadRequestException('Email is required.');
    }

    // Check Firestore for a user with this email
    const usersRef = firestore.collection('users');
    const snapshot = await usersRef.where('email', '==', email).limit(1).get();

    if (snapshot.empty) {
      // Throw error if email is NOT found
      throw new BadRequestException('Email not found.');
    }

    return { message: 'Email exists.' };
  }
}