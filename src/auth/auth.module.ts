import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { FirebaseAuthGuard } from './firebase-auth.guard';
import { StudentsModule } from '../students/students.module';
import { MailerModule } from '@nestjs-modules/mailer'; // <--- 1. Import this

@Module({
  imports: [
    StudentsModule, 
    MailerModule // <--- 2. Add this to imports
  ], 
  controllers: [AuthController],
  providers: [FirebaseAuthGuard, AuthService],
  exports: [AuthService],
})
export class AuthModule {}
