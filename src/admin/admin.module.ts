import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { ConfigController, SettingsController } from './settings.controller';

@Module({
  controllers: [AdminController, SettingsController, ConfigController], 
})
export class AdminModule {}
