import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config'; // Import ConfigService
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
    
    // --- UPDATED: Use forRootAsync to ensure .env is loaded first ---
    MailerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        transport: {
          host: 'smtp.gmail.com',
          port: 587,
          secure: false, // true for 465, false for other ports
          auth: {
            user: configService.get<string>('EMAIL_USER'),
            pass: configService.get<string>('EMAIL_PASS'),
          },
        },
        defaults: {
          from: '"VoltVault Support" <noreply@voltvault.com>',
        },
      }),
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