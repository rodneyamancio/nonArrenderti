import { Global, Module } from '@nestjs/common';
import { AdminBillingController, BillingController, PlansController } from './billing.controller';
import { BillingService } from './billing.service';

/** BillingGuard is registered in AppModule, after AuthGuard (it needs req.user). Global so the group guard and the groups controller can check limits and blocks. */
@Global()
@Module({
  controllers: [BillingController, PlansController, AdminBillingController],
  providers: [BillingService],
  exports: [BillingService],
})
export class BillingModule {}
