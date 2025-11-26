import {
  Controller,
  Post,
  Body,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  Get,
  Patch,
  Param,
  UseGuards,
  ForbiddenException,
  Req,
  NotFoundException,
  Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import * as multer from 'multer';
import { GcashService } from './wallet.service';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { firestore, bucket } from '../firebase/firebase.admin';
import { Request, Response } from 'express';

@UseGuards(FirebaseAuthGuard)
@Controller('wallet')
export class GcashController {
  constructor(private readonly gcashService: GcashService) {}

  // ---------------- USER ----------------
  @Post('upload')
  @UseInterceptors(FileInterceptor('receipt', { storage: multer.memoryStorage() }))
  async uploadReceipt(
    @Body('userUID') userUID: string,
    @Body('amount') amount: number,
    @UploadedFile() receiptFile: Express.Multer.File,
  ) {
    if (!userUID || !amount || !receiptFile) {
      throw new BadRequestException('Missing required fields');
    }
    return this.gcashService.uploadReceipt(userUID, parseFloat(amount.toString()), receiptFile);
  }

  // ---------------- ADMIN ----------------
  @Get('pending')
  async getPending(@Req() req: Request) {
    const adminUID = (req as any).user.uid;

    const userDoc = await this.gcashService.getUserDoc(adminUID);
    if (!userDoc || userDoc.role !== 'admin') throw new ForbiddenException();

    return this.gcashService.listPending();
  }

  @Patch('approve/:id')
  async approve(@Param('id') transactionId: string, @Req() req: Request) {
    const adminUID = (req as any).user.uid;

    const userDoc = await this.gcashService.getUserDoc(adminUID);
    if (!userDoc || userDoc.role !== 'admin') throw new ForbiddenException();

    return this.gcashService.approve(transactionId);
  }

  // ---------------- VIEW RECEIPT ----------------
  @Get('receipt/:id')
  async getReceipt(
    @Param('id') transactionId: string,
    @Req() req: Request,
    @Res() res: Response, // <-- inject response
  ) {
    const requesterUID = (req as any).user.uid;

    // Fetch transaction
    const txDoc = await firestore.collection('transactions').doc(transactionId).get();
    if (!txDoc.exists) throw new NotFoundException('Transaction not found');

    const tx = txDoc.data() as any;

    // Check if requester is either the user or an admin
    const userDoc = await firestore.collection('users').doc(requesterUID).get();
    const userData = userDoc.data();
    const isAdmin = userData?.role === 'admin';

    if (tx.userId !== requesterUID && !isAdmin) throw new ForbiddenException();
    if (!tx.receiptPath) throw new NotFoundException('Receipt path missing');

    const fileRef = bucket.file(tx.receiptPath);
    const [buffer] = await fileRef.download();

    // ✅ Set headers to force inline viewing
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Content-Disposition', `inline; filename="${tx.receiptPath.split('/').pop()}"`);
    res.send(buffer);
  }
  
  @Patch('deny/:id')
  async deny(@Param('id') transactionId: string, @Req() req: Request) {
    const adminUID = (req as any).user.uid;

    const userDoc = await this.gcashService.getUserDoc(adminUID);
    if (!userDoc || userDoc.role !== 'admin') throw new ForbiddenException();

    return this.gcashService.deny(transactionId);
  }

}