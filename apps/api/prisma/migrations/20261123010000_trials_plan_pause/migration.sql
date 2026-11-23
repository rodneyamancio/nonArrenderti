-- Trials granted by platform staff, and groups paused for being over the owner's plan.
ALTER TABLE "subscriptions" ADD COLUMN "trialPlanId" TEXT,
ADD COLUMN "trialUntil" DATE,
ADD COLUMN "trialGrantedAt" TIMESTAMP(3),
ADD COLUMN "trialGrantedById" TEXT,
ADD COLUMN "trialReminderSentAt" TIMESTAMP(3);

ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_trialPlanId_fkey" FOREIGN KEY ("trialPlanId") REFERENCES "plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "subscriptions_trialUntil_idx" ON "subscriptions"("trialUntil");

ALTER TABLE "groups" ADD COLUMN "planPausedAt" TIMESTAMP(3);
