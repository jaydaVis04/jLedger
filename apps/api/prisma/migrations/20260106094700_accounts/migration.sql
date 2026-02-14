-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "ledgerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AccountType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Account_ledgerId_idx" ON "Account"("ledgerId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_ledgerId_name_key" ON "Account"("ledgerId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Account_id_ledgerId_key" ON "Account"("id", "ledgerId");

-- CreateIndex
CREATE INDEX "Ledger_userId_idx" ON "Ledger"("userId");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_ledgerId_fkey" FOREIGN KEY ("ledgerId") REFERENCES "Ledger"("id") ON DELETE CASCADE ON UPDATE CASCADE;
