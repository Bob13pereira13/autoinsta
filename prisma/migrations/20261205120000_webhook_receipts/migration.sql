
-- CreateTable
CREATE TABLE "WebhookReceipt" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "object" TEXT,
    "accepted" BOOLEAN NOT NULL,
    "reason" TEXT,
    "entries" JSONB NOT NULL,

    CONSTRAINT "WebhookReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WebhookReceipt_createdAt_idx" ON "WebhookReceipt"("createdAt");

