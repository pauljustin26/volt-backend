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
  Headers,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import * as multer from 'multer';
import { GcashService } from './wallet.service';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { firestore, bucket } from '../firebase/firebase.admin';
import { Request, Response } from 'express';

@Controller('wallet')
export class GcashController {
  constructor(private readonly gcashService: GcashService) {}

  // ---------------- PAYMONGO WEBHOOK (Public) ----------------
  @Post('webhook')
  async handleWebhook(
    @Req() req: Request,
    @Res() res: Response,
    @Headers('paymongo-signature') signature: string
  ) {
    try {
      const event = req.body.data;
      if (!event) {
        console.log("Webhook Error: No event data found");
        return res.status(400).json({ error: "Invalid payload" });
      }

      const eventType = event.attributes.type;
      const eventData = event.attributes.data;
      const attributes = eventData.attributes;

      // 🔍 LOGGING: See exactly what PayMongo sent
      console.log(`\n🔔 Webhook Received: ${eventType}`);
      console.log(`🆔 Transaction ID: ${eventData.id}`);
      
      // Check for success (Checkout Session or Direct Payment)
      const isPaid = 
        eventType.includes('paid') || 
        eventType.includes('succeeded') ||
        attributes.status === 'paid';

      if (isPaid) {
        // Extract Metadata
        const userId = attributes.metadata?.userId;
        
        // Extract Amount (Handle different payload structures)
        let amount = 0;
        if (attributes.line_items && attributes.line_items.length > 0) {
           // Checkout Session structure
           amount = attributes.line_items[0].amount / 100;
        } else if (attributes.amount) {
           // Direct Payment structure
           amount = attributes.amount / 100;
        }

        console.log(`👤 User ID: ${userId}`);
        console.log(`💰 Amount: ${amount}`);

        if (userId && amount > 0) {
          console.log("✅ Processing Database Update...");
          await this.gcashService.addBalance(userId, amount, eventData.id);
          console.log("🚀 Database Updated Successfully!");
        } else {
          console.warn("⚠️ UserID or Amount missing from payload. Skipping DB update.");
        }
      } else {
        console.log(`ℹ️ Event type '${eventType}' is not a success event. Ignoring.`);
      }

      return res.json({ received: true });
    } catch (err: any) {
      console.error("❌ Webhook processing failed:", err.message);
      return res.status(500).json({ message: "Webhook error" });
    }
  }

  // ---------------- PAYMONGO INITIALIZE (Protected) ----------------
  @UseGuards(FirebaseAuthGuard)
  @Post('topup-online')
  async topUpOnline(@Req() req: Request, @Body() body: { amount: number }) {
    const { uid } = (req as any).user;
    if (!body.amount || body.amount < 100) {
        throw new BadRequestException("Minimum amount is 100");
    }
    return this.gcashService.createTopUp(uid, body.amount);
  }

  // ---------------- MANUAL UPLOAD (Protected) ----------------
  @UseGuards(FirebaseAuthGuard)
  @Post('upload')
  @UseInterceptors(FileInterceptor('receipt', { storage: multer.memoryStorage() }))
  async uploadReceipt(
    @Body('userUID') userUID: string,
    @Body('amount') amount: number,
    @Body('method') method: string,
    @UploadedFile() receiptFile: Express.Multer.File,
  ) {
    if (!userUID || !amount || !receiptFile) {
      throw new BadRequestException('Missing required fields');
    }
    return this.gcashService.uploadReceipt(userUID, parseFloat(amount.toString()), receiptFile, method);
  }

  // ---------------- ADMIN (Protected) ----------------
  @UseGuards(FirebaseAuthGuard)
  @Get('pending')
  async getPending(@Req() req: Request) {
    const adminUID = (req as any).user.uid;
    const userDoc = await this.gcashService.getUserDoc(adminUID);
    if (!userDoc || userDoc.role !== 'admin') throw new ForbiddenException();
    return this.gcashService.listPending();
  }

  @UseGuards(FirebaseAuthGuard)
  @Patch('approve/:id')
  async approve(@Param('id') transactionId: string, @Req() req: Request) {
    const adminUID = (req as any).user.uid;
    const userDoc = await this.gcashService.getUserDoc(adminUID);
    if (!userDoc || userDoc.role !== 'admin') throw new ForbiddenException();
    return this.gcashService.approve(transactionId);
  }

  // ---------------- VIEW RECEIPT (Protected) ----------------
  @UseGuards(FirebaseAuthGuard)
  @Get('receipt/:id')
  async getReceipt(
    @Param('id') transactionId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const requesterUID = (req as any).user.uid;
    const txDoc = await firestore.collection('transactions').doc(transactionId).get();
    if (!txDoc.exists) throw new NotFoundException('Transaction not found');

    const tx = txDoc.data() as any;
    const userDoc = await firestore.collection('users').doc(requesterUID).get();
    const userData = userDoc.data();
    const isAdmin = userData?.role === 'admin';

    if (tx.userId !== requesterUID && !isAdmin) throw new ForbiddenException();
    if (!tx.receiptPath) throw new NotFoundException('Receipt path missing');

    const fileRef = bucket.file(tx.receiptPath);
    const [buffer] = await fileRef.download();

    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Content-Disposition', `inline; filename="${tx.receiptPath.split('/').pop()}"`);
    res.send(buffer);
  }
  
  @UseGuards(FirebaseAuthGuard)
  @Patch('deny/:id')
  async deny(@Param('id') transactionId: string, @Req() req: Request) {
    const adminUID = (req as any).user.uid;
    const userDoc = await this.gcashService.getUserDoc(adminUID);
    if (!userDoc || userDoc.role !== 'admin') throw new ForbiddenException();
    return this.gcashService.deny(transactionId);
  }
}