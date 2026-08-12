CREATE TABLE "email_events" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "recipientDomain" TEXT NOT NULL,
    "subject" TEXT,
    "status" TEXT NOT NULL DEFAULT 'sent',
    "bouncedAt" TIMESTAMP(3),
    "complainedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "bounceReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "email_events_providerId_key" ON "email_events"("providerId");
CREATE INDEX "email_events_recipientDomain_createdAt_idx"
    ON "email_events"("recipientDomain", "createdAt");
CREATE INDEX "email_events_status_createdAt_idx"
    ON "email_events"("status", "createdAt");
