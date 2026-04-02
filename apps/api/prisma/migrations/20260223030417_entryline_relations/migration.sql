/*
  Warnings:

  - You are about to drop the column `createdAt` on the `EntryLine` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "EntryLine" DROP CONSTRAINT "EntryLine_accountId_ledgerId_fkey";

-- DropForeignKey
ALTER TABLE "EntryLine" DROP CONSTRAINT "EntryLine_ledgerEntryId_ledgerId_fkey";

-- DropForeignKey
ALTER TABLE "EntryLine" DROP CONSTRAINT "EntryLine_ledgerId_fkey";

-- DropIndex
DROP INDEX "EntryLine_accountId_idx";

-- DropIndex
DROP INDEX "EntryLine_ledgerEntryId_idx";

-- AlterTable
ALTER TABLE "EntryLine" DROP COLUMN "createdAt";

-- AddForeignKey
ALTER TABLE "EntryLine" ADD CONSTRAINT "EntryLine_ledgerId_fkey" FOREIGN KEY ("ledgerId") REFERENCES "Ledger"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntryLine" ADD CONSTRAINT "EntryLine_ledgerEntryId_ledgerId_fkey" FOREIGN KEY ("ledgerEntryId", "ledgerId") REFERENCES "LedgerEntry"("id", "ledgerId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntryLine" ADD CONSTRAINT "EntryLine_accountId_ledgerId_fkey" FOREIGN KEY ("accountId", "ledgerId") REFERENCES "Account"("id", "ledgerId") ON DELETE CASCADE ON UPDATE CASCADE;
