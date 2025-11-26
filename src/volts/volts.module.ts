// backend/src/volts/volts.module.ts
import { Module } from "@nestjs/common";
import { VoltsService } from "./volts.service";
import { VoltsController } from "./volts.controller";

@Module({
  providers: [VoltsService],
  controllers: [VoltsController],
})
export class VoltsModule {}
