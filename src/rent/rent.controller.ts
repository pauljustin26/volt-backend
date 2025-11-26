// backend/src/rent/rent.controller.ts
import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { RentService, RentDto } from './rent.service';
import { firestore } from '../firebase/firebase.admin';

interface AuthRequest extends Request {
  user?: any;
}

@Controller('rent')
export class RentController {
  constructor(private readonly rentService: RentService) {}

  @UseGuards(FirebaseAuthGuard)
  @Post('confirm')
  async confirmRent(@Req() req: AuthRequest, @Body() rentDto: RentDto) {
    const { uid: studentUID } = req.user;

    const userDoc = await firestore.collection('users').doc(studentUID).get();
    if (!userDoc.exists) throw new Error('User not found');

    const studentId = userDoc.data()?.studentId;
    if (!studentId) throw new Error('Student ID missing');

    return await this.rentService.confirmRent(
      studentUID,
      studentId,
      rentDto.voltID,
      rentDto.fee,
      rentDto.duration      // ⭐ ADDED
    );
  }
}
