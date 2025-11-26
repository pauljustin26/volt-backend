// backend/src/wallet/wallet.module.ts
import { Module } from "@nestjs/common";
import { GcashController } from "./wallet.controller";
import { GcashService } from "./wallet.service";

@Module({
  controllers: [ GcashController],
  providers: [ GcashService],
})
export class WalletModule {}
