-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('open', 'paid', 'void');

-- AlterTable
ALTER TABLE "groups" ADD COLUMN     "billingPausedAt" TIMESTAMP(3),
ADD COLUMN     "resumesOnWeek" DATE;

-- CreateTable
CREATE TABLE "plans" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "priceCents" INTEGER NOT NULL DEFAULT 0,
    "intervalMonths" INTEGER NOT NULL DEFAULT 1,
    "maxGroups" INTEGER,
    "maxMembersPerGroup" INTEGER,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "method" TEXT,
    "providerSubscriptionId" TEXT,
    "providerIdempotencyKey" TEXT,
    "livemode" BOOLEAN NOT NULL DEFAULT false,
    "nextDueDate" DATE,
    "billingProfile" JSONB,
    "status" TEXT NOT NULL DEFAULT 'ok',
    "blockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "providerSubscriptionId" TEXT NOT NULL,
    "cycle" INTEGER,
    "amountCents" INTEGER NOT NULL,
    "dueDate" DATE NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'open',
    "providerReference" TEXT,
    "paymentUrl" TEXT,
    "checkoutId" TEXT,
    "checkoutUrl" TEXT,
    "checkoutDueDate" DATE,
    "checkoutKey" TEXT,
    "paidAt" TIMESTAMP(3),
    "paidVia" TEXT,
    "paidTransactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_userId_key" ON "subscriptions"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_providerSubscriptionId_key" ON "subscriptions"("providerSubscriptionId");

-- CreateIndex
CREATE INDEX "subscriptions_status_idx" ON "subscriptions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_providerReference_key" ON "invoices"("providerReference");

-- CreateIndex
CREATE INDEX "invoices_userId_status_idx" ON "invoices"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_providerSubscriptionId_dueDate_key" ON "invoices"("providerSubscriptionId", "dueDate");

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
