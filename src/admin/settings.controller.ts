// backend/src/admin/settings.controller.ts
import { 
  Controller, Get, Patch, Body, UseGuards, ForbiddenException, Req, 
  UseInterceptors, UploadedFiles 
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express'; 
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { firestore, bucket } from '../firebase/firebase.admin';
import { v4 as uuidv4 } from 'uuid';

@UseGuards(FirebaseAuthGuard)
@Controller('admin/settings')
export class SettingsController {

  // 1. Fetch Configuration
  @Get()
  async getSettings(@Req() req: any) {
    this.checkAdmin(req.user);
    
    const doc = await firestore.collection('settings').doc('config').get();
    
    // Default Data Structure (Only Payments now)
    const defaults = {
      gcashNumber: '',
      mayaNumber: '',
      gcashQrUrl: null,
      mayaQrUrl: null,
    };

    return doc.exists ? { ...defaults, ...doc.data() } : defaults;
  }

  // 2. Update Configuration (Supports JSON + Files)
  @Patch()
  @UseInterceptors(FileFieldsInterceptor([
    { name: 'gcashQr', maxCount: 1 },
    { name: 'mayaQr', maxCount: 1 },
  ]))
  async updateSettings(
    @Req() req: any, 
    @Body() body: any,
    @UploadedFiles() files: { gcashQr?: Express.Multer.File[], mayaQr?: Express.Multer.File[] }
  ) {
    this.checkAdmin(req.user);

    // Parse text fields
    const updates: any = {
      gcashNumber: body.gcashNumber || '',
      mayaNumber: body.mayaNumber || '',
      updatedAt: new Date(),
      updatedBy: req.user.uid
    };

    // Handle File Uploads (QR Codes)
    if (files?.gcashQr?.[0]) {
      updates.gcashQrUrl = await this.uploadFile(files.gcashQr[0], 'admin_qr/gcash');
    }
    if (files?.mayaQr?.[0]) {
      updates.mayaQrUrl = await this.uploadFile(files.mayaQr[0], 'admin_qr/maya');
    }

    // Save to Firestore
    await firestore.collection('settings').doc('config').set(updates, { merge: true });

    return { message: "Payment settings updated successfully", updates };
  }

  // Helper: Upload Logic
  private async uploadFile(file: Express.Multer.File, path: string): Promise<string> {
    const fileName = `${path}_${Date.now()}_${uuidv4()}.jpg`;
    const fileRef = bucket.file(fileName);
    const token = uuidv4();

    await fileRef.save(file.buffer, {
      metadata: { 
        contentType: file.mimetype,
        metadata: { firebaseStorageDownloadTokens: token }
      }
    });

    return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(fileName)}?alt=media&token=${token}`;
  }

  // Helper: Security Check
  private checkAdmin(user: any) {
    if (!user.role || user.role !== 'admin') {
      throw new ForbiddenException('Not authorized');
    }
  }
}

@Controller('config')
export class ConfigController {
  
  // Allow any authenticated user (Admin or Regular) to see payment methods
  @UseGuards(FirebaseAuthGuard) 
  @Get('payment-methods')
  async getPaymentConfig() {
    const doc = await firestore.collection('settings').doc('config').get();
    
    const defaults = {
      gcashNumber: 'Not set',
      mayaNumber: 'Not set',
      gcashQrUrl: null,
      mayaQrUrl: null,
    };

    if (!doc.exists) return defaults;
    const data = doc.data() || {};

    // Only return safe public info, don't return unrelated admin settings
    return {
      gcashNumber: data.gcashNumber || defaults.gcashNumber,
      mayaNumber: data.mayaNumber || defaults.mayaNumber,
      gcashQrUrl: data.gcashQrUrl || null,
      mayaQrUrl: data.mayaQrUrl || null,
    };
  }
}