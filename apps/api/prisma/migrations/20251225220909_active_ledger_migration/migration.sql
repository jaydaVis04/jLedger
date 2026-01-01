-- AlterTable
ALTER TABLE "User" ADD COLUMN     "activeLedgerId" TEXT;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_activeLedgerId_fkey" FOREIGN KEY ("activeLedgerId") REFERENCES "Ledger"("id") ON DELETE SET NULL ON UPDATE CASCADE;
