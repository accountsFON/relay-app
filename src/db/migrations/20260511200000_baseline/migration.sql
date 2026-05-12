-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "public"."ActivityKind" AS ENUM ('comment', 'client_created', 'client_profile_edited', 'client_archived', 'client_imported', 'client_am_assigned', 'client_am_unassigned', 'client_designer_assigned', 'client_designer_unassigned', 'run_created', 'run_queued', 'run_started', 'run_brief_ready', 'run_facts_ready', 'run_copy_ready', 'run_completed', 'run_failed', 'run_deleted', 'run_due_date_changed', 'posts_created', 'post_edited', 'post_status_changed', 'member_invited', 'member_joined', 'member_role_changed', 'member_removed', 'batch_created', 'batch_passed', 'batch_sent_back', 'batch_revision_dispatched', 'batch_revision_completed', 'batch_step_advanced');

-- CreateEnum
CREATE TYPE "public"."ClientStatus" AS ENUM ('active', 'paused', 'archived');

-- CreateEnum
CREATE TYPE "public"."EventVisibility" AS ENUM ('public', 'internal', 'admin_only');

-- CreateEnum
CREATE TYPE "public"."Plan" AS ENUM ('smb', 'agency', 'enterprise');

-- CreateEnum
CREATE TYPE "public"."RelayEventType" AS ENUM ('pass_forward', 'send_back', 'revision_dispatched', 'revision_completed');

-- CreateEnum
CREATE TYPE "public"."RelayRole" AS ENUM ('admin', 'am', 'designer', 'client');

-- CreateEnum
CREATE TYPE "public"."RelayStep" AS ENUM ('onboarding_gate', 'copy', 'in_design', 'designs_completed', 'am_review_design', 'design_revisions', 'am_qa_pre_client', 'sent_to_client', 'client_decision', 'ready_to_schedule', 'implementing_revisions', 'revisions_complete', 'final_qa_schedule');

-- CreateEnum
CREATE TYPE "public"."RevisionItemStatus" AS ENUM ('pending', 'in_progress', 'complete');

-- CreateEnum
CREATE TYPE "public"."RevisionItemType" AS ENUM ('copy', 'design', 'am_inline');

-- CreateEnum
CREATE TYPE "public"."RunStatus" AS ENUM ('queued', 'running', 'complete', 'failed');

-- CreateEnum
CREATE TYPE "public"."UserRole" AS ENUM ('admin', 'account_manager', 'designer', 'client');

-- CreateTable
CREATE TABLE "public"."activity_events" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "runId" TEXT,
    "postId" TEXT,
    "actorId" TEXT,
    "kind" "public"."ActivityKind" NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "visibility" "public"."EventVisibility" NOT NULL DEFAULT 'internal',

    CONSTRAINT "activity_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."batches" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "currentStep" "public"."RelayStep" NOT NULL,
    "currentSubState" TEXT,
    "currentHolder" TEXT NOT NULL,
    "currentRole" "public"."RelayRole" NOT NULL,
    "scheduledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."checklist_items" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "step" "public"."RelayStep" NOT NULL,
    "label" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "checked" BOOLEAN NOT NULL DEFAULT false,
    "checkedBy" TEXT,
    "checkedAt" TIMESTAMP(3),

    CONSTRAINT "checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."clients" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "assignedAmId" TEXT,
    "name" TEXT NOT NULL,
    "businessSummary" TEXT,
    "brandVoice" TEXT,
    "industry" TEXT,
    "location" TEXT,
    "phone" TEXT,
    "mainCta" TEXT,
    "focus1" TEXT,
    "focus2" TEXT,
    "focus3" TEXT,
    "dos" TEXT,
    "donts" TEXT,
    "postingDays" TEXT NOT NULL DEFAULT 'Mon,Wed,Fri',
    "postLength" TEXT,
    "urls" TEXT[],
    "targetAudience" TEXT,
    "holidayHandling" TEXT NOT NULL DEFAULT 'Major-US',
    "excludedDates" TEXT[],
    "assetsFolderUrl" TEXT,
    "status" "public"."ClientStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "autoCrawl" TEXT NOT NULL DEFAULT 'always',
    "crawledData" TEXT,
    "crawledDataAt" TIMESTAMP(3),
    "assignedDesignerId" TEXT,
    "onboardingCompletedAt" TIMESTAMP(3),

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."content_runs" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "triggeredById" TEXT NOT NULL,
    "targetMonth" TEXT NOT NULL,
    "status" "public"."RunStatus" NOT NULL DEFAULT 'queued',
    "triggerJobId" TEXT,
    "brief" TEXT,
    "supportingFacts" TEXT,
    "crawledContent" TEXT,
    "postingDates" TEXT[],
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "anthropicCostUsd" DECIMAL(10,4),
    "apifyCostUsd" DECIMAL(10,4),
    "creditsConsumed" INTEGER,
    "openaiCostUsd" DECIMAL(10,4),
    "tokenUsage" JSONB,
    "totalCostUsd" DECIMAL(10,4),

    CONSTRAINT "content_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."memberships" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "role" "public"."UserRole" NOT NULL,
    "permissionOverrides" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."mentions" (
    "id" TEXT NOT NULL,
    "activityEventId" TEXT NOT NULL,
    "mentionedUserId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mentions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "plan" "public"."Plan" NOT NULL DEFAULT 'smb',
    "clerkOrgId" TEXT NOT NULL,
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "runCredits" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."permission_audit_logs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "targetUserId" TEXT,
    "targetRole" "public"."UserRole",
    "permissionKey" TEXT NOT NULL,
    "fromValue" BOOLEAN,
    "toValue" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "targetMembershipId" TEXT,
    "usedPlatformOverride" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "permission_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."post_versions" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "authorId" TEXT,
    "caption" TEXT NOT NULL,
    "hashtags" TEXT[],
    "graphicHook" TEXT,
    "designerNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."posts" (
    "id" TEXT NOT NULL,
    "contentRunId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "postDate" TIMESTAMP(3) NOT NULL,
    "caption" TEXT NOT NULL,
    "hashtags" TEXT[],
    "graphicHook" TEXT,
    "designerNotes" TEXT,
    "mediaUrls" TEXT[],
    "scheduledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "batchId" TEXT,

    CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."relay_events" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "type" "public"."RelayEventType" NOT NULL,
    "fromStep" "public"."RelayStep" NOT NULL,
    "toStep" "public"."RelayStep" NOT NULL,
    "fromUser" TEXT NOT NULL,
    "toUser" TEXT NOT NULL,
    "reason" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "relay_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."revision_items" (
    "id" TEXT NOT NULL,
    "revisionPlanId" TEXT NOT NULL,
    "type" "public"."RevisionItemType" NOT NULL,
    "description" TEXT NOT NULL,
    "status" "public"."RevisionItemStatus" NOT NULL DEFAULT 'pending',
    "assignedTo" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "revision_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."revision_plans" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "revision_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."role_defaults" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "role" "public"."UserRole" NOT NULL,
    "permissionKey" TEXT NOT NULL,
    "allow" BOOLEAN NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "role_defaults_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."users" (
    "id" TEXT NOT NULL,
    "clerkUserId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "role" "public"."UserRole" NOT NULL DEFAULT 'admin',
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "linkedClientId" TEXT,
    "permissionOverrides" JSONB,
    "platformOwner" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "activity_events_actorId_idx" ON "public"."activity_events"("actorId" ASC);

-- CreateIndex
CREATE INDEX "activity_events_clientId_createdAt_idx" ON "public"."activity_events"("clientId" ASC, "createdAt" DESC);

-- CreateIndex
CREATE INDEX "activity_events_clientId_visibility_createdAt_idx" ON "public"."activity_events"("clientId" ASC, "visibility" ASC, "createdAt" DESC);

-- CreateIndex
CREATE INDEX "activity_events_postId_idx" ON "public"."activity_events"("postId" ASC);

-- CreateIndex
CREATE INDEX "activity_events_runId_idx" ON "public"."activity_events"("runId" ASC);

-- CreateIndex
CREATE INDEX "batches_clientId_currentStep_idx" ON "public"."batches"("clientId" ASC, "currentStep" ASC);

-- CreateIndex
CREATE INDEX "batches_currentHolder_currentStep_idx" ON "public"."batches"("currentHolder" ASC, "currentStep" ASC);

-- CreateIndex
CREATE INDEX "checklist_items_batchId_step_idx" ON "public"."checklist_items"("batchId" ASC, "step" ASC);

-- CreateIndex
CREATE INDEX "clients_assignedAmId_idx" ON "public"."clients"("assignedAmId" ASC);

-- CreateIndex
CREATE INDEX "clients_assignedDesignerId_idx" ON "public"."clients"("assignedDesignerId" ASC);

-- CreateIndex
CREATE INDEX "clients_organizationId_idx" ON "public"."clients"("organizationId" ASC);

-- CreateIndex
CREATE INDEX "content_runs_clientId_idx" ON "public"."content_runs"("clientId" ASC);

-- CreateIndex
CREATE INDEX "memberships_organizationId_idx" ON "public"."memberships"("organizationId" ASC);

-- CreateIndex
CREATE INDEX "memberships_userId_idx" ON "public"."memberships"("userId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "memberships_userId_organizationId_key" ON "public"."memberships"("userId" ASC, "organizationId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "mentions_activityEventId_mentionedUserId_key" ON "public"."mentions"("activityEventId" ASC, "mentionedUserId" ASC);

-- CreateIndex
CREATE INDEX "mentions_mentionedUserId_readAt_idx" ON "public"."mentions"("mentionedUserId" ASC, "readAt" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_clerkOrgId_key" ON "public"."organizations"("clerkOrgId" ASC);

-- CreateIndex
CREATE INDEX "permission_audit_logs_organizationId_idx" ON "public"."permission_audit_logs"("organizationId" ASC);

-- CreateIndex
CREATE INDEX "permission_audit_logs_targetUserId_idx" ON "public"."permission_audit_logs"("targetUserId" ASC);

-- CreateIndex
CREATE INDEX "post_versions_postId_createdAt_idx" ON "public"."post_versions"("postId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "posts_batchId_idx" ON "public"."posts"("batchId" ASC);

-- CreateIndex
CREATE INDEX "posts_clientId_idx" ON "public"."posts"("clientId" ASC);

-- CreateIndex
CREATE INDEX "posts_contentRunId_idx" ON "public"."posts"("contentRunId" ASC);

-- CreateIndex
CREATE INDEX "relay_events_batchId_createdAt_idx" ON "public"."relay_events"("batchId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "revision_items_revisionPlanId_status_idx" ON "public"."revision_items"("revisionPlanId" ASC, "status" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "revision_plans_batchId_key" ON "public"."revision_plans"("batchId" ASC);

-- CreateIndex
CREATE INDEX "role_defaults_organizationId_idx" ON "public"."role_defaults"("organizationId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "role_defaults_organizationId_role_permissionKey_key" ON "public"."role_defaults"("organizationId" ASC, "role" ASC, "permissionKey" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "users_clerkUserId_key" ON "public"."users"("clerkUserId" ASC);

-- CreateIndex
CREATE INDEX "users_linkedClientId_idx" ON "public"."users"("linkedClientId" ASC);

-- CreateIndex
CREATE INDEX "users_organizationId_idx" ON "public"."users"("organizationId" ASC);

-- AddForeignKey
ALTER TABLE "public"."activity_events" ADD CONSTRAINT "activity_events_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."activity_events" ADD CONSTRAINT "activity_events_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "public"."clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."activity_events" ADD CONSTRAINT "activity_events_postId_fkey" FOREIGN KEY ("postId") REFERENCES "public"."posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."activity_events" ADD CONSTRAINT "activity_events_runId_fkey" FOREIGN KEY ("runId") REFERENCES "public"."content_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."batches" ADD CONSTRAINT "batches_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "public"."clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."batches" ADD CONSTRAINT "batches_currentHolder_fkey" FOREIGN KEY ("currentHolder") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."checklist_items" ADD CONSTRAINT "checklist_items_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "public"."batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."clients" ADD CONSTRAINT "clients_assignedAmId_fkey" FOREIGN KEY ("assignedAmId") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."clients" ADD CONSTRAINT "clients_assignedDesignerId_fkey" FOREIGN KEY ("assignedDesignerId") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."clients" ADD CONSTRAINT "clients_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."content_runs" ADD CONSTRAINT "content_runs_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "public"."clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."content_runs" ADD CONSTRAINT "content_runs_triggeredById_fkey" FOREIGN KEY ("triggeredById") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."memberships" ADD CONSTRAINT "memberships_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."memberships" ADD CONSTRAINT "memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."mentions" ADD CONSTRAINT "mentions_activityEventId_fkey" FOREIGN KEY ("activityEventId") REFERENCES "public"."activity_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."mentions" ADD CONSTRAINT "mentions_mentionedUserId_fkey" FOREIGN KEY ("mentionedUserId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."permission_audit_logs" ADD CONSTRAINT "permission_audit_logs_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."permission_audit_logs" ADD CONSTRAINT "permission_audit_logs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."permission_audit_logs" ADD CONSTRAINT "permission_audit_logs_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."post_versions" ADD CONSTRAINT "post_versions_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."post_versions" ADD CONSTRAINT "post_versions_postId_fkey" FOREIGN KEY ("postId") REFERENCES "public"."posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."posts" ADD CONSTRAINT "posts_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "public"."batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."posts" ADD CONSTRAINT "posts_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "public"."clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."posts" ADD CONSTRAINT "posts_contentRunId_fkey" FOREIGN KEY ("contentRunId") REFERENCES "public"."content_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."relay_events" ADD CONSTRAINT "relay_events_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "public"."batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."revision_items" ADD CONSTRAINT "revision_items_revisionPlanId_fkey" FOREIGN KEY ("revisionPlanId") REFERENCES "public"."revision_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."revision_plans" ADD CONSTRAINT "revision_plans_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "public"."batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."role_defaults" ADD CONSTRAINT "role_defaults_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."users" ADD CONSTRAINT "users_linkedClientId_fkey" FOREIGN KEY ("linkedClientId") REFERENCES "public"."clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."users" ADD CONSTRAINT "users_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
