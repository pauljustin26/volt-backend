import { Controller, Post, Body, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { ReturnService } from './return.service';

interface AuthRequest extends Request {
  user?: any;
}

@Controller('return')
export class ReturnController {
  constructor(private readonly returnService: ReturnService) {}

  @UseGuards(FirebaseAuthGuard)
  @Post('confirm')
  async confirmReturn(@Req() req: AuthRequest, @Body() body: { voltID: string }) {
    const studentUID = req.user.uid;
    return await this.returnService.confirmReturn(studentUID, body.voltID);
  }
}