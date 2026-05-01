-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "cafeId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Message_employeeId_idx" ON "Message"("employeeId");

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
