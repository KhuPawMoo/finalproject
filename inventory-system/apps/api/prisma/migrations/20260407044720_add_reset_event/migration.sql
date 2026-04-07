-- CreateTable
CREATE TABLE "ResetEvent" (
    "id" TEXT NOT NULL,
    "initiatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResetEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ResetEvent_createdAt_idx" ON "ResetEvent"("createdAt");
