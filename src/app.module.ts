import { Module, Logger } from '@nestjs/common';
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
    
    // --- UPDATED: Configuration for BREVO ---
    MailerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const logger = new Logger('MailerModule');
        
        const emailUser = configService.get<string>('EMAIL_USER');
        const emailPass = configService.get<string>('EMAIL_PASS');

        if (!emailUser || !emailPass) {
          logger.error('CRITICAL: EMAIL_USER or EMAIL_PASS is missing!');
        } else {
          logger.log(`Mailer configured for Brevo.`);
          logger.log(`Sending as: ${emailUser}`);
        }

        return {
          transport: {
            host: 'smtp-relay.brevo.com', // Brevo Host
            port: 587, // Standard Brevo Port
            secure: false, // Must be false for 587
            auth: {
              user: emailUser,
              pass: emailPass,
            },
            // Brevo specific settings to prevent timeouts
            tls: {
              ciphers: 'SSLv3',
            },
            logger: true,
            debug: true,
          },
          defaults: {
            from: `"VoltVault Support" <${emailUser}>`,
          },
        };
      },
      inject: [ConfigService],
    }),
    
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