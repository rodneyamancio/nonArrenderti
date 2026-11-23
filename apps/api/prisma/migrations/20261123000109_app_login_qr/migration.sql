-- CreateTable
CREATE TABLE "app_login_requests" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "originSessionId" TEXT NOT NULL,
    "secretHash" TEXT NOT NULL,
    "shortCodeHash" TEXT NOT NULL,
    "verifierHash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "matchCode" INTEGER,
    "choices" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "deviceName" TEXT,
    "devicePlatform" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "scannedAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "sessionId" TEXT,

    CONSTRAINT "app_login_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "app_login_requests_secretHash_key" ON "app_login_requests"("secretHash");

-- CreateIndex
CREATE UNIQUE INDEX "app_login_requests_shortCodeHash_key" ON "app_login_requests"("shortCodeHash");

-- CreateIndex
CREATE INDEX "app_login_requests_userId_createdAt_idx" ON "app_login_requests"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "app_login_requests_expiresAt_idx" ON "app_login_requests"("expiresAt");

-- AddForeignKey
ALTER TABLE "app_login_requests" ADD CONSTRAINT "app_login_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
