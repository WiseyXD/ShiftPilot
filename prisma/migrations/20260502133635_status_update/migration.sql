/*
  Warnings:

  - The `status` column on the `Shift` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "ShiftStatus" AS ENUM ('pending', 'accepted', 'declined', 'reassigned');

-- AlterTable
ALTER TABLE "Shift" DROP COLUMN "status",
ADD COLUMN     "status" "ShiftStatus" NOT NULL DEFAULT 'pending';
