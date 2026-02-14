/*
  Warnings:

  - A unique constraint covering the columns `[id,ledgerId]` on the table `LedgerEntry` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "EntryLineSide" AS ENUM ('DEBIT', 'CREDIT');

-- CreateTable
CREATE TABLE "EntryLine" (
    "id" TEXT NOT NULL,
    "ledgerId" TEXT NOT NULL,
    "ledgerEntryId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "side" "EntryLineSide" NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "currency" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EntryLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EntryLine_ledgerId_idx" ON "EntryLine"("ledgerId");

-- CreateIndex
CREATE INDEX "EntryLine_ledgerEntryId_idx" ON "EntryLine"("ledgerEntryId");

-- CreateIndex
CREATE INDEX "EntryLine_accountId_idx" ON "EntryLine"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerEntry_id_ledgerId_key" ON "LedgerEntry"("id", "ledgerId");

-- AddForeignKey
ALTER TABLE "EntryLine" ADD CONSTRAINT "EntryLine_ledgerId_fkey" FOREIGN KEY ("ledgerId") REFERENCES "Ledger"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntryLine" ADD CONSTRAINT "EntryLine_ledgerEntryId_ledgerId_fkey" FOREIGN KEY ("ledgerEntryId", "ledgerId") REFERENCES "LedgerEntry"("id", "ledgerId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntryLine" ADD CONSTRAINT "EntryLine_accountId_ledgerId_fkey" FOREIGN KEY ("accountId", "ledgerId") REFERENCES "Account"("id", "ledgerId") ON DELETE RESTRICT ON UPDATE CASCADE;
