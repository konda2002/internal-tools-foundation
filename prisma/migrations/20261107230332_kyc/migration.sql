-- CreateTable
CREATE TABLE "kyc_cases" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customer_id" TEXT NOT NULL,
    "document_type" TEXT NOT NULL,
    "risk_score" INTEGER NOT NULL,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "decided_by_id" TEXT,
    "decided_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "kyc_cases_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "kyc_cases_status_created_at_idx" ON "kyc_cases"("status", "created_at");
