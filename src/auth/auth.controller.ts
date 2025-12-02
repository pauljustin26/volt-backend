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
import { AuthService } from './auth.service';

interface AuthRequest extends Request {
  user?: any;
}

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);
  constructor(
    private readonly studentsService: StudentsService,
    private readonly authService: AuthService 
  ) {}

  // ---------------- INIT USER (called after Firebase signup) ----------------
  @UseGuards(FirebaseAuthGuard)
  @Post('init')
  async initUser(@Req() req: AuthRequest, @Body() body: any) {
    const { uid, email } = req.user;
    
    // 1. Extract new fields from body
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

    // 🔹 0. Check student ID against CSV list
    if (!this.studentsService.isValidStudent(studentId)) {
      throw new BadRequestException('Invalid student ID.');
    }

    // 🔹 1. Ensure the student ID isn’t already used by another account
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

    // 🔹 2. Prepare user reference
    const userRef = firestore.collection('users').doc(uid);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      // Create new user record
      this.logger.log(`Creating new user document for UID=${uid}`);

      // Pull firstName/lastName from CSV if missing
      const studentInfo = this.studentsService.getStudentInfo(studentId);

      await userRef.set({
        firstName: firstName || studentInfo?.firstName || '',
        lastName: lastName || studentInfo?.lastName || '',
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
      
      // Send verification email on init
      await this.authService.sendCustomVerificationEmail(email);

    } else {
      this.logger.log(`User document already exists for UID=${uid}, merging updates`);
      const updatePayload: Record<string, any> = {};
      if (firstName) updatePayload.firstName = firstName;
      if (lastName) updatePayload.lastName = lastName;
      if (studentId) updatePayload.studentId = studentId;
      if (mobileNumber) updatePayload.mobileNumber = mobileNumber;
      if (termsAccepted !== undefined) updatePayload.termsAccepted = termsAccepted;
      if (termsAcceptedAt) updatePayload.termsAcceptedAt = termsAcceptedAt;

      if (Object.keys(updatePayload).length > 0) {
        updatePayload.updatedAt = admin.firestore.FieldValue.serverTimestamp();
        await userRef.set(updatePayload, { merge: true });
      }
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

  // ---------------- CHECK STUDENT ID ----------------
  @Post('check-student')
  async checkStudent(@Body() body: { studentId: string }) {
    const { studentId } = body;
    if (!studentId) throw new BadRequestException('Student ID is required.');

    if (!this.studentsService.isValidStudent(studentId)) {
      throw new BadRequestException('Student ID not found in official records.');
    }

    const existingStudent = await firestore
      .collection('users')
      .where('studentId', '==', studentId)
      .get();

    if (!existingStudent.empty) {
      throw new BadRequestException(`Student ID is already linked to another account.`);
    }

    return { message: 'Student ID is available.' };
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

  // ---------------- PASSWORD RESET ----------------
  @Post('reset-password')
  async resetPassword(@Body() body: { email: string }) {
    if (!body.email) {
      throw new BadRequestException('Email is required');
    }
    return this.authService.sendCustomPasswordReset(body.email);
  }

  // ---------------- RESEND VERIFICATION (NEW) ----------------
  @Post('resend-verification')
  async resendVerification(@Body() body: { email: string }) {
    if (!body.email) {
      throw new BadRequestException('Email is required');
    }
    return this.authService.sendCustomVerificationEmail(body.email);
  }
}