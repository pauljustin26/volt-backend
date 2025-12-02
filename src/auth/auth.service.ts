import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import admin from '../firebase/firebase.admin';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(private readonly mailerService: MailerService) {}

  // --- THEME COLORS ---
  private readonly colors = {
    surface: "#333F5B",    
    text: "#FFFFFF",
    secondary: "#FDAE37",  
    button: "#242E94",     
    buttonText: "#FFFFFF"
  };

  async sendCustomPasswordReset(email: string) {
    try {
      // 1. Generate link
      const resetLink = await admin.auth().generatePasswordResetLink(email);

      // 2. Send Custom Email
      await this.mailerService.sendMail({
        to: email,
        subject: 'Reset your VoltVault Password',
        html: this.getHtmlTemplate(email, resetLink, 'Reset Password', 'Reset My Password', 'We received a request to reset your password.'),
      });

      this.logger.log(`Password reset email sent to ${email}`);
      return { message: 'Password reset email sent successfully.' };

    } catch (error: any) {
      this.logger.error(`Error sending reset email: ${error.message}`);
      if (error.code === 'auth/user-not-found') throw new BadRequestException('User not found.');
      throw new BadRequestException('Failed to send reset email.');
    }
  }

  async sendCustomVerificationEmail(email: string) {
    try {
      // 1. Generate Verification Link
      const verifyLink = await admin.auth().generateEmailVerificationLink(email);

      // 2. Send Custom Email
      await this.mailerService.sendMail({
        to: email,
        subject: 'Verify your VoltVault Account',
        html: this.getHtmlTemplate(
          email, 
          verifyLink, 
          'Verify Account', 
          'Verify My Email', 
          'Welcome to VoltVault! Please verify your email address to activate your account.'
        ),
      });

      this.logger.log(`Verification email sent to ${email}`);
      return { message: 'Verification email sent successfully.' };

    } catch (error: any) {
      this.logger.error(`Error sending verification email: ${error.message}`);
      throw new BadRequestException('Failed to send verification email.');
    }
  }

  // Helper to keep HTML clean and consistent
  private getHtmlTemplate(email: string, link: string, title: string, btnText: string, message: string) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
      </head>
      <body>
        <div style="font-family: Arial, sans-serif; padding: 40px 20px; color: ${this.colors.text};">
          <div style="background-color: ${this.colors.surface}; max-width: 600px; margin: 0 auto; padding: 30px; border-radius: 12px; border: 1px solid #38466D; box-shadow: 0 4px 15px rgba(0,0,0,0.3);">
            
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: ${this.colors.text}; margin: 0;">VoltVault</h1>
              <h3 style="color: ${this.colors.text}; margin-top: 10px;">${title}</h3>
            </div>

            <div style="line-height: 1.6; font-size: 16px; color: #E0E0E0;">
              <p>Hello,</p>
              <p>${message}</p>
              <p>Account: <span style="color: ${this.colors.secondary}; font-weight: bold;">${email}</span></p>
              
              <div style="text-align: center; margin: 35px 0;">
                <a href="${link}" style="background-color: ${this.colors.button}; color: ${this.colors.buttonText}; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; display: inline-block; border: 1px solid #38466D;">
                  ${btnText}
                </a>
              </div>
              
              <p>If you did not request this, you can safely ignore this email.</p>
              
              <p style="margin-top: 30px;">
                Best regards,<br/>
                <span style="color: ${this.colors.secondary}; font-weight: bold;">The VoltVault Team</span>
              </p>
            </div>

            <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #38466D; text-align: center; font-size: 12px; color: #8899AC;">
              <p>Need help? Contact support@voltvault.com</p>
              <p>&copy; ${new Date().getFullYear()} VoltVault. All rights reserved.</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;
  }
}