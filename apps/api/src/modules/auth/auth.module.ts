import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { BillingGuard } from '../billing/billing.guard';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';

@Module({
  controllers: [AuthController],
  // Order matters: AuthGuard resolves req.user, then BillingGuard checks the block.
  providers: [AuthService, { provide: APP_GUARD, useClass: AuthGuard }, { provide: APP_GUARD, useClass: BillingGuard }],
  exports: [AuthService],
})
export class AuthModule {}
