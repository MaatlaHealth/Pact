-- CreateEnum
CREATE TYPE "OrganizationKind" AS ENUM ('STANDARD', 'JUDGE_DEMO');

-- CreateEnum
CREATE TYPE "MembershipRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER');

-- CreateEnum
CREATE TYPE "AgentRole" AS ENUM ('BUYER', 'WORKER', 'VERIFIER');

-- CreateEnum
CREATE TYPE "AgentStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "TaskCategory" AS ENUM ('LANDING_PAGE', 'JSON_DATASET');

-- CreateEnum
CREATE TYPE "AgentRunPurpose" AS ENUM ('CONTRACT_GENERATION', 'NEGOTIATION', 'EXECUTION', 'CORRECTION', 'VERIFICATION', 'SUBJECTIVE_REVIEW');

-- CreateEnum
CREATE TYPE "AgentRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'TIMED_OUT', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AgentMessageKind" AS ENUM ('TASK_BRIEF', 'PROPOSAL', 'COUNTER_PROPOSAL', 'ACCEPT', 'REJECT', 'STATUS', 'SUBMISSION', 'VERIFICATION_REPORT', 'CORRECTION_REQUEST', 'NOTE');

-- CreateEnum
CREATE TYPE "ToolExecutionStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED', 'TIMED_OUT');

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('DRAFT', 'AWAITING_APPROVAL', 'NEGOTIATING', 'AWAITING_PAYMENT_AUTHORIZATION', 'AUTHORIZED', 'IN_PROGRESS', 'UNDER_VERIFICATION', 'CORRECTION_REQUIRED', 'AWAITING_HUMAN_REVIEW', 'ELIGIBLE_FOR_CAPTURE', 'CAPTURE_PENDING', 'CAPTURED', 'VOID_PENDING', 'VOIDED', 'EXPIRED', 'DISPUTED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentState" AS ENUM ('NONE', 'ORDER_CREATED', 'AWAITING_PAYER_APPROVAL', 'PAYER_APPROVED', 'AUTHORIZED', 'CAPTURE_PENDING', 'CAPTURE_UNCERTAIN', 'CAPTURED', 'VOID_PENDING', 'VOIDED', 'EXPIRED', 'DENIED', 'FAILED');

-- CreateEnum
CREATE TYPE "VerificationState" AS ENUM ('NOT_STARTED', 'QUEUED', 'RUNNING', 'PASSED', 'FAILED', 'NEEDS_HUMAN_REVIEW', 'ERROR');

-- CreateEnum
CREATE TYPE "ContractVersionAuthor" AS ENUM ('AI', 'USER', 'NEGOTIATION');

-- CreateEnum
CREATE TYPE "CriterionKind" AS ENUM ('OBJECTIVE', 'SUBJECTIVE');

-- CreateEnum
CREATE TYPE "VerificationMethod" AS ENUM ('HTTP_AVAILABILITY', 'REQUIRED_SECTIONS', 'NAVIGATION_LINKS', 'RESPONSIVE_VIEWPORTS', 'CONTACT_FORM_SUBMISSION', 'ACCESSIBILITY_AUDIT', 'LIGHTHOUSE_MOBILE_PERFORMANCE', 'CONSOLE_ERRORS', 'BROKEN_LINKS', 'HTML_VALIDITY', 'JSON_SCHEMA', 'DATASET_ROW_COUNT', 'DATASET_UNIQUENESS', 'RUBRIC_REVIEW');

-- CreateEnum
CREATE TYPE "DeliverableKind" AS ENUM ('STATIC_SITE', 'JSON_DATASET');

-- CreateEnum
CREATE TYPE "VerificationRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'PASSED', 'FAILED', 'NEEDS_HUMAN_REVIEW', 'ERROR');

-- CreateEnum
CREATE TYPE "VerificationRecommendation" AS ENUM ('ACCEPT', 'CORRECT', 'HUMAN_REVIEW');

-- CreateEnum
CREATE TYPE "EvidenceKind" AS ENUM ('SCREENSHOT', 'LIGHTHOUSE_REPORT', 'HTTP_TRACE', 'CONSOLE_LOG', 'FORM_SUBMISSION', 'TEST_OUTPUT', 'ARTIFACT_MANIFEST', 'ACCESSIBILITY_REPORT', 'LINK_REPORT');

-- CreateEnum
CREATE TYPE "PolicyAction" AS ENUM ('APPROVE_CONTRACT', 'START_NEGOTIATION', 'ACCEPT_NEGOTIATED_TERMS', 'CREATE_PAYMENT_ORDER', 'AUTHORIZE_PAYMENT', 'START_WORK', 'SUBMIT_DELIVERABLE', 'RUN_VERIFICATION', 'CAPTURE_PAYMENT', 'VOID_AUTHORIZATION');

-- CreateEnum
CREATE TYPE "PolicyOutcome" AS ENUM ('ALLOW', 'DENY', 'REQUIRE_HUMAN_APPROVAL');

-- CreateEnum
CREATE TYPE "ApprovalKind" AS ENUM ('CONTRACT_TERMS', 'PAYMENT_AUTHORIZATION', 'CAPTURE', 'SUBJECTIVE_REVIEW', 'HUMAN_REVIEW');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PayPalEnvironment" AS ENUM ('SANDBOX', 'LIVE');

-- CreateEnum
CREATE TYPE "PaymentEventSource" AS ENUM ('API', 'WEBHOOK', 'SYSTEM', 'USER');

-- CreateEnum
CREATE TYPE "FinancialOperationType" AS ENUM ('CREATE_ORDER', 'AUTHORIZE_ORDER', 'CAPTURE_AUTHORIZATION', 'VOID_AUTHORIZATION');

-- CreateEnum
CREATE TYPE "FinancialOperationStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'UNCERTAIN');

-- CreateEnum
CREATE TYPE "WebhookProcessingStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'IGNORED', 'FAILED', 'DUPLICATE', 'REJECTED');

-- CreateEnum
CREATE TYPE "PassportTier" AS ENUM ('NEW', 'ESTABLISHED', 'TRUSTED');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('USER', 'AGENT', 'SYSTEM', 'WEBHOOK');

-- CreateEnum
CREATE TYPE "AuditSeverity" AS ENUM ('INFO', 'NOTICE', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'DEAD');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "email_verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),
    "ip_address" TEXT,
    "user_agent" TEXT,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_verification_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verification_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "kind" "OrganizationKind" NOT NULL DEFAULT 'STANDARD',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "role" "MembershipRole" NOT NULL DEFAULT 'MEMBER',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitations" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "MembershipRole" NOT NULL DEFAULT 'MEMBER',
    "token_hash" TEXT NOT NULL,
    "invited_by_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "scopes" TEXT[],
    "created_by_id" TEXT NOT NULL,
    "last_used_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spending_policies" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "max_transaction_amount_cents" INTEGER NOT NULL DEFAULT 10000,
    "monthly_budget_cents" INTEGER NOT NULL DEFAULT 50000,
    "per_agent_limit_cents" INTEGER NOT NULL DEFAULT 25000,
    "cold_start_agent_limit_cents" INTEGER NOT NULL DEFAULT 7500,
    "require_human_approval_for_capture" BOOLEAN NOT NULL DEFAULT false,
    "human_approval_above_cents" INTEGER,
    "subjective_criteria_require_human" BOOLEAN NOT NULL DEFAULT true,
    "max_negotiation_rounds" INTEGER NOT NULL DEFAULT 4,
    "max_correction_attempts" INTEGER NOT NULL DEFAULT 3,
    "allowed_categories" TEXT[] DEFAULT ARRAY['LANDING_PAGE', 'JSON_DATASET']::TEXT[],
    "capture_rate_limit_per_hour" INTEGER NOT NULL DEFAULT 20,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "spending_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agents" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "AgentRole" NOT NULL,
    "description" TEXT NOT NULL,
    "status" "AgentStatus" NOT NULL DEFAULT 'ACTIVE',
    "model_provider" TEXT NOT NULL DEFAULT 'gemini',
    "model" TEXT NOT NULL,
    "prompt_version" TEXT NOT NULL,
    "is_platform_agent" BOOLEAN NOT NULL DEFAULT false,
    "registered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_capabilities" (
    "id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "category" "TaskCategory" NOT NULL,
    "description" TEXT NOT NULL,
    "max_budget_cents" INTEGER,

    CONSTRAINT "agent_capabilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_runs" (
    "id" TEXT NOT NULL,
    "contract_id" TEXT,
    "agent_id" TEXT NOT NULL,
    "purpose" "AgentRunPurpose" NOT NULL,
    "status" "AgentRunStatus" NOT NULL DEFAULT 'QUEUED',
    "correlation_id" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "iterations" INTEGER NOT NULL DEFAULT 0,
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "error" TEXT,
    "summary" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_messages" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "contract_id" TEXT,
    "from_agent_id" TEXT NOT NULL,
    "to_agent_id" TEXT,
    "kind" "AgentMessageKind" NOT NULL,
    "sequence" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "structured" JSONB,
    "correlation_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_tool_executions" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "tool_name" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "output" JSONB,
    "status" "ToolExecutionStatus" NOT NULL DEFAULT 'RUNNING',
    "error" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "duration_ms" INTEGER,

    CONSTRAINT "agent_tool_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contracts" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "category" "TaskCategory" NOT NULL,
    "status" "ContractStatus" NOT NULL DEFAULT 'DRAFT',
    "payment_state" "PaymentState" NOT NULL DEFAULT 'NONE',
    "verification_state" "VerificationState" NOT NULL DEFAULT 'NOT_STARTED',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "budget_cents" INTEGER NOT NULL,
    "agreed_amount_cents" INTEGER,
    "deadline" TIMESTAMP(3),
    "buyer_agent_id" TEXT,
    "worker_agent_id" TEXT,
    "verifier_agent_id" TEXT,
    "approved_version_id" TEXT,
    "approved_hash" TEXT,
    "correction_count" INTEGER NOT NULL DEFAULT 0,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "failure_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_versions" (
    "id" TEXT NOT NULL,
    "contract_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "content" JSONB NOT NULL,
    "content_hash" TEXT NOT NULL,
    "author_type" "ContractVersionAuthor" NOT NULL,
    "author_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "approved_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "acceptance_criteria" (
    "id" TEXT NOT NULL,
    "contract_version_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "kind" "CriterionKind" NOT NULL,
    "method" "VerificationMethod" NOT NULL,
    "parameters" JSONB NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL,

    CONSTRAINT "acceptance_criteria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deliverables" (
    "id" TEXT NOT NULL,
    "contract_id" TEXT NOT NULL,
    "worker_agent_id" TEXT NOT NULL,
    "run_id" TEXT,
    "submission_number" INTEGER NOT NULL,
    "kind" "DeliverableKind" NOT NULL,
    "storage_prefix" TEXT NOT NULL,
    "manifest" JSONB NOT NULL,
    "root_hash" TEXT NOT NULL,
    "preview_token" TEXT NOT NULL,
    "worker_notes" TEXT,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deliverables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_runs" (
    "id" TEXT NOT NULL,
    "contract_id" TEXT NOT NULL,
    "deliverable_id" TEXT NOT NULL,
    "verifier_agent_id" TEXT NOT NULL,
    "agent_run_id" TEXT,
    "attempt" INTEGER NOT NULL,
    "status" "VerificationRunStatus" NOT NULL DEFAULT 'QUEUED',
    "recommendation" "VerificationRecommendation",
    "summary" TEXT,
    "report" JSONB,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_results" (
    "id" TEXT NOT NULL,
    "verification_run_id" TEXT NOT NULL,
    "criterion_id" TEXT NOT NULL,
    "criterion_key" TEXT NOT NULL,
    "method" "VerificationMethod" NOT NULL,
    "passed" BOOLEAN,
    "score" DOUBLE PRECISION,
    "details" JSONB NOT NULL,
    "checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence_records" (
    "id" TEXT NOT NULL,
    "verification_run_id" TEXT NOT NULL,
    "result_id" TEXT,
    "kind" "EvidenceKind" NOT NULL,
    "storage_key" TEXT,
    "content_hash" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "mime_type" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evidence_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "form_captures" (
    "id" TEXT NOT NULL,
    "contract_id" TEXT NOT NULL,
    "deliverable_id" TEXT,
    "token" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "user_agent" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "form_captures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policy_decisions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "contract_id" TEXT,
    "action" "PolicyAction" NOT NULL,
    "outcome" "PolicyOutcome" NOT NULL,
    "rules" JSONB NOT NULL,
    "input_snapshot" JSONB NOT NULL,
    "engine_version" TEXT NOT NULL,
    "decided_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "policy_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_requests" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "contract_id" TEXT NOT NULL,
    "kind" "ApprovalKind" NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "context" JSONB,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_at" TIMESTAMP(3),
    "decided_by_id" TEXT,
    "decision_note" TEXT,
    "expires_at" TIMESTAMP(3),

    CONSTRAINT "approval_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paypal_orders" (
    "id" TEXT NOT NULL,
    "contract_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "environment" "PayPalEnvironment" NOT NULL DEFAULT 'SANDBOX',
    "paypal_order_id" TEXT NOT NULL,
    "intent" TEXT NOT NULL DEFAULT 'AUTHORIZE',
    "status" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "approve_url" TEXT,
    "payer_id" TEXT,
    "payer_email" TEXT,
    "create_response" JSONB NOT NULL,
    "latest_response" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "paypal_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paypal_authorizations" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "paypal_authorization_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "expiration_time" TIMESTAMP(3),
    "raw_response" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "paypal_authorizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paypal_captures" (
    "id" TEXT NOT NULL,
    "authorization_id" TEXT NOT NULL,
    "paypal_capture_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "final_capture" BOOLEAN NOT NULL DEFAULT true,
    "request_id" TEXT NOT NULL,
    "raw_response" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "paypal_captures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_events" (
    "id" TEXT NOT NULL,
    "contract_id" TEXT NOT NULL,
    "order_id" TEXT,
    "source" "PaymentEventSource" NOT NULL,
    "kind" TEXT NOT NULL,
    "from_state" "PaymentState",
    "to_state" "PaymentState",
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_operations" (
    "id" TEXT NOT NULL,
    "contract_id" TEXT NOT NULL,
    "operation" "FinancialOperationType" NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "status" "FinancialOperationStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "response" JSONB,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "financial_operations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'paypal',
    "event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "resource_type" TEXT,
    "resource_id" TEXT,
    "signature_verified" BOOLEAN NOT NULL,
    "verification_status" TEXT NOT NULL,
    "processing_status" "WebhookProcessingStatus" NOT NULL DEFAULT 'RECEIVED',
    "payload" JSONB NOT NULL,
    "error" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signing_keys" (
    "id" TEXT NOT NULL,
    "algorithm" TEXT NOT NULL DEFAULT 'Ed25519',
    "public_key_pem" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retired_at" TIMESTAMP(3),

    CONSTRAINT "signing_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipts" (
    "id" TEXT NOT NULL,
    "receipt_number" TEXT NOT NULL,
    "contract_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "worker_agent_id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "payload_hash" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "signing_key_id" TEXT NOT NULL,
    "capture_ref" TEXT NOT NULL,
    "settled_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trust_passports" (
    "id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "tier" "PassportTier" NOT NULL DEFAULT 'NEW',
    "verified_task_count" INTEGER NOT NULL DEFAULT 0,
    "successful_delivery_count" INTEGER NOT NULL DEFAULT 0,
    "correction_count" INTEGER NOT NULL DEFAULT 0,
    "failed_verification_count" INTEGER NOT NULL DEFAULT 0,
    "completed_value_by_currency" JSONB NOT NULL DEFAULT '{}',
    "categories" JSONB NOT NULL DEFAULT '{}',
    "verification_methods" JSONB NOT NULL DEFAULT '[]',
    "receipt_numbers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "first_verified_at" TIMESTAMP(3),
    "last_verified_at" TIMESTAMP(3),
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trust_passports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT,
    "contract_id" TEXT,
    "actor_type" "ActorType" NOT NULL,
    "actor_id" TEXT,
    "actor_label" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "severity" "AuditSeverity" NOT NULL DEFAULT 'INFO',
    "metadata" JSONB,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "run_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "locked_at" TIMESTAMP(3),
    "locked_by" TEXT,
    "last_error" TEXT,
    "dedupe_key" TEXT,
    "contract_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_settings" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integration_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limit_buckets" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "reset_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rate_limit_buckets_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "email_verification_tokens_token_hash_key" ON "email_verification_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "email_verification_tokens_user_id_idx" ON "email_verification_tokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE INDEX "memberships_organization_id_idx" ON "memberships"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_user_id_organization_id_key" ON "memberships"("user_id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_token_hash_key" ON "invitations"("token_hash");

-- CreateIndex
CREATE INDEX "invitations_organization_id_idx" ON "invitations"("organization_id");

-- CreateIndex
CREATE INDEX "invitations_email_idx" ON "invitations"("email");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_key_hash_key" ON "api_keys"("key_hash");

-- CreateIndex
CREATE INDEX "api_keys_organization_id_idx" ON "api_keys"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "spending_policies_organization_id_key" ON "spending_policies"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "agents_slug_key" ON "agents"("slug");

-- CreateIndex
CREATE INDEX "agents_role_status_idx" ON "agents"("role", "status");

-- CreateIndex
CREATE UNIQUE INDEX "agent_capabilities_agent_id_category_key" ON "agent_capabilities"("agent_id", "category");

-- CreateIndex
CREATE INDEX "agent_runs_contract_id_idx" ON "agent_runs"("contract_id");

-- CreateIndex
CREATE INDEX "agent_runs_agent_id_idx" ON "agent_runs"("agent_id");

-- CreateIndex
CREATE INDEX "agent_runs_correlation_id_idx" ON "agent_runs"("correlation_id");

-- CreateIndex
CREATE INDEX "agent_messages_contract_id_created_at_idx" ON "agent_messages"("contract_id", "created_at");

-- CreateIndex
CREATE INDEX "agent_messages_run_id_sequence_idx" ON "agent_messages"("run_id", "sequence");

-- CreateIndex
CREATE INDEX "agent_tool_executions_run_id_idx" ON "agent_tool_executions"("run_id");

-- CreateIndex
CREATE UNIQUE INDEX "contracts_approved_version_id_key" ON "contracts"("approved_version_id");

-- CreateIndex
CREATE INDEX "contracts_organization_id_status_idx" ON "contracts"("organization_id", "status");

-- CreateIndex
CREATE INDEX "contracts_organization_id_created_at_idx" ON "contracts"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "contracts_worker_agent_id_idx" ON "contracts"("worker_agent_id");

-- CreateIndex
CREATE UNIQUE INDEX "contract_versions_contract_id_version_key" ON "contract_versions"("contract_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "acceptance_criteria_contract_version_id_key_key" ON "acceptance_criteria"("contract_version_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "deliverables_preview_token_key" ON "deliverables"("preview_token");

-- CreateIndex
CREATE UNIQUE INDEX "deliverables_contract_id_submission_number_key" ON "deliverables"("contract_id", "submission_number");

-- CreateIndex
CREATE UNIQUE INDEX "verification_runs_contract_id_attempt_key" ON "verification_runs"("contract_id", "attempt");

-- CreateIndex
CREATE UNIQUE INDEX "verification_results_verification_run_id_criterion_key_key" ON "verification_results"("verification_run_id", "criterion_key");

-- CreateIndex
CREATE INDEX "evidence_records_verification_run_id_idx" ON "evidence_records"("verification_run_id");

-- CreateIndex
CREATE INDEX "form_captures_token_received_at_idx" ON "form_captures"("token", "received_at");

-- CreateIndex
CREATE INDEX "policy_decisions_contract_id_decided_at_idx" ON "policy_decisions"("contract_id", "decided_at");

-- CreateIndex
CREATE INDEX "approval_requests_organization_id_status_idx" ON "approval_requests"("organization_id", "status");

-- CreateIndex
CREATE INDEX "approval_requests_contract_id_idx" ON "approval_requests"("contract_id");

-- CreateIndex
CREATE UNIQUE INDEX "paypal_orders_contract_id_key" ON "paypal_orders"("contract_id");

-- CreateIndex
CREATE UNIQUE INDEX "paypal_orders_paypal_order_id_key" ON "paypal_orders"("paypal_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "paypal_orders_request_id_key" ON "paypal_orders"("request_id");

-- CreateIndex
CREATE INDEX "paypal_orders_organization_id_idx" ON "paypal_orders"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "paypal_authorizations_paypal_authorization_id_key" ON "paypal_authorizations"("paypal_authorization_id");

-- CreateIndex
CREATE INDEX "paypal_authorizations_order_id_idx" ON "paypal_authorizations"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "paypal_captures_paypal_capture_id_key" ON "paypal_captures"("paypal_capture_id");

-- CreateIndex
CREATE UNIQUE INDEX "paypal_captures_request_id_key" ON "paypal_captures"("request_id");

-- CreateIndex
CREATE INDEX "payment_events_contract_id_created_at_idx" ON "payment_events"("contract_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "financial_operations_idempotency_key_key" ON "financial_operations"("idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "financial_operations_contract_id_operation_key" ON "financial_operations"("contract_id", "operation");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_event_id_key" ON "webhook_events"("event_id");

-- CreateIndex
CREATE INDEX "webhook_events_event_type_received_at_idx" ON "webhook_events"("event_type", "received_at");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_receipt_number_key" ON "receipts"("receipt_number");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_contract_id_key" ON "receipts"("contract_id");

-- CreateIndex
CREATE INDEX "receipts_organization_id_created_at_idx" ON "receipts"("organization_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "trust_passports_agent_id_key" ON "trust_passports"("agent_id");

-- CreateIndex
CREATE INDEX "audit_events_organization_id_created_at_idx" ON "audit_events"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_events_contract_id_created_at_idx" ON "audit_events"("contract_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "jobs_dedupe_key_key" ON "jobs"("dedupe_key");

-- CreateIndex
CREATE INDEX "jobs_status_run_at_idx" ON "jobs"("status", "run_at");

-- CreateIndex
CREATE INDEX "jobs_contract_id_idx" ON "jobs"("contract_id");

-- CreateIndex
CREATE UNIQUE INDEX "integration_settings_organization_id_provider_key" ON "integration_settings"("organization_id", "provider");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "email_verification_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spending_policies" ADD CONSTRAINT "spending_policies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agents" ADD CONSTRAINT "agents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_capabilities" ADD CONSTRAINT "agent_capabilities_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_messages" ADD CONSTRAINT "agent_messages_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "agent_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_messages" ADD CONSTRAINT "agent_messages_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_messages" ADD CONSTRAINT "agent_messages_from_agent_id_fkey" FOREIGN KEY ("from_agent_id") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_messages" ADD CONSTRAINT "agent_messages_to_agent_id_fkey" FOREIGN KEY ("to_agent_id") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_tool_executions" ADD CONSTRAINT "agent_tool_executions_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "agent_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_buyer_agent_id_fkey" FOREIGN KEY ("buyer_agent_id") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_worker_agent_id_fkey" FOREIGN KEY ("worker_agent_id") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_verifier_agent_id_fkey" FOREIGN KEY ("verifier_agent_id") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_approved_version_id_fkey" FOREIGN KEY ("approved_version_id") REFERENCES "contract_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_versions" ADD CONSTRAINT "contract_versions_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_versions" ADD CONSTRAINT "contract_versions_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acceptance_criteria" ADD CONSTRAINT "acceptance_criteria_contract_version_id_fkey" FOREIGN KEY ("contract_version_id") REFERENCES "contract_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_worker_agent_id_fkey" FOREIGN KEY ("worker_agent_id") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "agent_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_runs" ADD CONSTRAINT "verification_runs_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_runs" ADD CONSTRAINT "verification_runs_deliverable_id_fkey" FOREIGN KEY ("deliverable_id") REFERENCES "deliverables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_runs" ADD CONSTRAINT "verification_runs_verifier_agent_id_fkey" FOREIGN KEY ("verifier_agent_id") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_runs" ADD CONSTRAINT "verification_runs_agent_run_id_fkey" FOREIGN KEY ("agent_run_id") REFERENCES "agent_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_results" ADD CONSTRAINT "verification_results_verification_run_id_fkey" FOREIGN KEY ("verification_run_id") REFERENCES "verification_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_results" ADD CONSTRAINT "verification_results_criterion_id_fkey" FOREIGN KEY ("criterion_id") REFERENCES "acceptance_criteria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_records" ADD CONSTRAINT "evidence_records_verification_run_id_fkey" FOREIGN KEY ("verification_run_id") REFERENCES "verification_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_records" ADD CONSTRAINT "evidence_records_result_id_fkey" FOREIGN KEY ("result_id") REFERENCES "verification_results"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_captures" ADD CONSTRAINT "form_captures_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_captures" ADD CONSTRAINT "form_captures_deliverable_id_fkey" FOREIGN KEY ("deliverable_id") REFERENCES "deliverables"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_decisions" ADD CONSTRAINT "policy_decisions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_decisions" ADD CONSTRAINT "policy_decisions_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paypal_orders" ADD CONSTRAINT "paypal_orders_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paypal_orders" ADD CONSTRAINT "paypal_orders_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paypal_authorizations" ADD CONSTRAINT "paypal_authorizations_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "paypal_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paypal_captures" ADD CONSTRAINT "paypal_captures_authorization_id_fkey" FOREIGN KEY ("authorization_id") REFERENCES "paypal_authorizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "paypal_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_operations" ADD CONSTRAINT "financial_operations_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_worker_agent_id_fkey" FOREIGN KEY ("worker_agent_id") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_signing_key_id_fkey" FOREIGN KEY ("signing_key_id") REFERENCES "signing_keys"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trust_passports" ADD CONSTRAINT "trust_passports_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_settings" ADD CONSTRAINT "integration_settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
