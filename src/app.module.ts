import { Module, Logger } from '@nestjs/common'; // Added Logger
import { ConfigModule, ConfigService } from '@nestjs/config'; 
import { MailerModule } from '@nestjs-modules/mailer';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { WalletModule } from './wallet/wallet.module';
import { VoltsModule } from './volts/volts.module';
import { TransactionsModule } from './transactions/transactions.module';
import { RentModule } from './rent/rent.module';
import { ReturnModule } from './return/return.module';
import { AdminModule } from './admin/admin.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    
    // --- UPDATED: Switched to Port 465 (SSL) to fix Connection Timeouts ---
    MailerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const logger = new Logger('MailerModule');
        const emailUser = configService.get<string>('EMAIL_USER');
        const emailPass = configService.get<string>('EMAIL_PASS');

        // DEBUG: Print to Render logs (check these in your dashboard!)
        if (!emailUser || !emailPass) {
          logger.error('CRITICAL: EMAIL_USER or EMAIL_PASS is missing in Environment Variables!');
        } else {
          logger.log(`Mailer configured for user: ${emailUser}`);
          logger.log(`Password is ${emailPass ? 'SET (Length: ' + emailPass.length + ')' : 'MISSING'}`);
        }

        return {
          transport: {
            host: 'smtp.gmail.com',
            port: 465, // Changed to 465 for better stability on cloud servers
            secure: true, // true for 465, false for other ports
            auth: {
              user: emailUser,
              pass: emailPass,
            },
            // Add connection settings to debug timeouts
            logger: true,
            debug: true,
            connectionTimeout: 20000, // 20 seconds
            greetingTimeout: 20000,
            socketTimeout: 20000,
          },
          defaults: {
            from: `"VoltVault Support" <${emailUser}>`,
          },
        };
      },
      inject: [ConfigService],
    }),
    // -----------------------------------------------------------------

    AuthModule,
    UsersModule,
    WalletModule,
    VoltsModule,
    RentModule,
    ReturnModule,
    TransactionsModule,
    AdminModule
  ],
})
export class AppModule {}