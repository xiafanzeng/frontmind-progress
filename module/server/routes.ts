import type * as TRPCCore from "@trpc/server/unstable-core-do-not-import";
import type { BuiltRouter, CreateRootTypes, DecorateCreateRouterOptions, DefaultErrorShape, QueryProcedure, MutationProcedure, Router, ProcedureBuilder } from "@trpc/server/unstable-core-do-not-import";
import { accountActivityInputSchema, accountActivityOutputSchema, accountActivityPageInputSchema, accountActivityPageOutputSchema } from "@frontmind/monitoring-contracts";
import {
  adminBankTransferOutputSchema,
  adminBillingAdjustmentInputSchema,
  adminBillingUserOutputSchema,
  adminAuditOutputSchema,
  adminCreateUserInputSchema,
  adminOperationDetailOutputSchema,
  adminOperationsListInputSchema,
  adminOperationsListOutputSchema,
  adminOverviewOutputSchema,
  adminProviderCostOutputSchema,
  adminResetPasswordInputSchema,
  adminRunListOutputSchema,
  adminSetUserStatusInputSchema,
  adminUserListOutputSchema,
  adminUserViewSchema,
  authMeOutputSchema,
  auditListInputSchema,
  approveBankTransferInputSchema,
  bankTransferReviewOutputSchema,
  booleanResultOutputSchemas,
  billingLedgerEntryOutputSchema,
  billingMonitorQuoteInputSchema,
  billingMonitorQuoteOutputSchema,
  billingQuoteInputSchema,
  billingQuoteOutputSchema,
  billingSummaryOutputSchema,
  changePasswordInputSchema,
  createTopupOrderInputSchema,
  createTopupOrderOutputSchema,
  deletedMonitorOutputSchema,
  deletedProjectOutputSchema,
  deletedRunOutputSchema,
  idSchema,
  listInputSchema,
  mediaPublishingAdminAdjustmentInputSchema,
  mediaPublishingAdminBankReviewInputSchema,
  mediaPublishingAdminBankReviewOutputSchema,
  mediaPublishingAdminUserOutputSchema,
  mediaPublishingBankTransferReviewOutputSchema,
  mediaPublishingBillingSummaryOutputSchema,
  mediaPublishingCreateTopupOrderInputSchema,
  mediaPublishingCreateTopupOrderOutputSchema,
  mediaPublishingLedgerEntryOutputSchema,
  mediaPublishingSubmitBankTransferReviewInputSchema,
  mediaPublishingSwitchTopupPaymentMethodInputSchema,
  mediaPublishingTopupListInputSchema,
  mediaPublishingTopupListOutputSchema,
  mediaPublishingTopupOrderOutputSchema,
  mediaPublishingTopupStatusInputSchema,
  mediaPublishingTopupStatusOutputSchema,
  monitoringAnalysisInputSchema,
  monitoringAnalysisOutputSchema,
  monitoringAnswerDetailOutputSchema,
  monitoringAnswerGetInputSchema,
  monitoringAnswersListInputSchema,
  monitoringAnswersListOutputSchema,
  monitoringScopeSchema,
  monitoringSummaryOutputSchema,
  monitorCreateInputSchema,
  monitorDetailOutputSchema,
  monitorListOutputSchema,
  monitorMutationOutputSchema,
  monitorUpdateInputSchema,
  paymentMethodsOutputSchema,
  platformAcceptanceBatchOutputSchema,
  platformAcceptanceGetInputSchema,
  platformAcceptanceListInputSchema,
  platformAcceptancePlanInputSchema,
  platformAcceptancePlanOutputSchema,
  platformAcceptanceStartInputSchema,
  platformCapabilityInputSchema,
  platformOutputSchema,
  pricingOutputSchema,
  projectBrandUpdateInputSchema,
  projectCreateInputSchema,
  projectOutputSchema,
  projectUpdateInputSchema,
  publisherAdminEmergencyStopInputSchema,
  publisherAdminCapabilityOutputSchema,
  publisherAdminCatalogRunOutputSchema,
  publisherAdminCatalogSyncRequestOutputSchema,
  publisherAdminLiveWhitelistInputSchema,
  publisherAdminMediaCapabilityInputSchema,
  publisherAdminReconciliationCandidateOutputSchema,
  publisherAdminRuntimeUpdateInputSchema,
  publisherAdminUnknownItemOutputSchema,
  publisherAdminUnknownBindInputSchema,
  publisherAdminUnknownResubmitInputSchema,
  publisherArticleAssetOutputSchema,
  publisherArticleAssetsInputSchema,
  publisherArticleListInputSchema,
  publisherArticleListOutputSchema,
  publisherArticleOutputSchema,
  publisherArticleVersionOutputSchema,
  publisherBatchInputSchema,
  publisherBatchListInputSchema,
  publisherBatchListOutputSchema,
  publisherBatchOutputSchema,
  publisherCreateArticleInputSchema,
  publisherDashboardOutputSchema,
  publisherDocxImportOutputSchema,
  publisherDraftInputSchema,
  publisherDraftOutputSchema,
  publisherFreezeArticleInputSchema,
  publisherImportListInputSchema,
  publisherImportListOutputSchema,
  publisherImportStatusInputSchema,
  publisherMediaListInputSchema,
  publisherMediaListOutputSchema,
  publisherMediaFacetsInputSchema,
  publisherMediaFacetsOutputSchema,
  publisherPreflightInputSchema,
  publisherPreflightOutputSchema,
  publisherRefreshDraftMediaInputSchema,
  publisherRuntimeOutputSchema,
  publisherSaveArticleInputSchema,
  publisherSaveDraftInputSchema,
  publisherSaveDraftTitlesInputSchema,
  publisherSubmitInputSchema,
  publisherSubmitOutputSchema,
  rejectBankTransferInputSchema,
  regionOutputSchema,
  runCreationResultOutputSchema,
  runDetailOutputSchema,
  runListOutputSchema,
  runNowInputSchema,
  runRecordOutputSchema,
  submitBankTransferReviewInputSchema,
  submitBankTransferReviewOutputSchema,
  switchTopupPaymentMethodInputSchema,
  switchTopupPaymentMethodOutputSchema,
  topupOrderOutputSchema,
  topupStatusInputSchema,
  topupStatusOutputSchema,
} from "@frontmind/monitoring-contracts";
import {initTRPC} from '@trpc/server';
import type {ProgressRouteCore} from './route-core.js';
import {translateRepositoryErrors} from './route-errors.js';
import {z} from 'zod';
import {TRPCError} from '@trpc/server';
export function createProgressRoutes<Context extends object>(core:ProgressRouteCore<Context>) {
 const t=initTRPC.context<Context>().create();
 const customerProcedure=t.procedure.use(async({ctx,next})=>next({ctx:{...ctx,...await core.authorize(ctx as unknown as Context,'customer')}}));
 const adminProcedure=t.procedure.use(async({ctx,next})=>next({ctx:{...ctx,...await core.authorize(ctx as unknown as Context,'admin')}}));
 return {customer:{
 costs:t.router({
 summary:customerProcedure.output(billingSummaryOutputSchema).query(({ctx})=>ctx.costs.summary()),
 quote:customerProcedure.input(billingQuoteInputSchema).output(billingQuoteOutputSchema).mutation(({ctx,input})=>ctx.costs.quote(input)),
 quoteMonitor:customerProcedure.input(billingMonitorQuoteInputSchema).output(billingMonitorQuoteOutputSchema).query(async({ctx,input})=>{
 const monitor=await ctx.repository.getMonitor(ctx.user.id,input.monitorId);
 const [quote,summary]=await Promise.all([ctx.costs.quote({items:monitor.platforms.map(platform=>({platformId:platform.platformId,mode:platform.mode,screenshot:platform.screenshot===1?1:platform.screenshot===2?2:0,regionCode:platform.clientType==="mobile"?null:platform.regionCode,quantity:monitor.questions.length*monitor.version.repetitions}))}),ctx.costs.summary()]);
 return {monitorId:input.monitorId,pricingVersionId:quote.pricingVersionId,currency:quote.currency,scale:quote.scale,totalAmountTenThousandths:quote.totalAmountTenThousandths,availableTenThousandths:summary.availableTenThousandths,sufficient:BigInt(summary.availableTenThousandths)>=BigInt(quote.totalAmountTenThousandths)};
 })}),
projects: t.router({
    list: customerProcedure
      .output(z.array(projectOutputSchema))
      .query(({ ctx }) => ctx.repository.listProjects(ctx.user.id)),
    listDeleted: customerProcedure
      .output(z.array(deletedProjectOutputSchema))
      .query(({ ctx }) => ctx.repository.listDeletedProjects(ctx.user.id)),
    get: customerProcedure
      .input(z.object({ projectId: idSchema }))
      .output(projectOutputSchema)
      .query(({ ctx, input }) =>
        ctx.repository.getProject(ctx.user.id, input.projectId),
      ),
    create: customerProcedure
      .input(projectCreateInputSchema)
      .output(projectOutputSchema)
      .mutation(({ ctx, input }) =>
        translateRepositoryErrors(() =>
          ctx.repository.createProject(ctx.user.id, input, ctx.audit),
        ),
      ),
    updateBrand: customerProcedure
      .input(projectBrandUpdateInputSchema)
      .output(projectOutputSchema)
      .mutation(({ ctx, input }) =>
        translateRepositoryErrors(() =>
          ctx.repository.updateProjectBrand(ctx.user.id, input, ctx.audit),
        ),
      ),
    update: customerProcedure
      .input(projectUpdateInputSchema)
      .output(projectOutputSchema)
      .mutation(({ ctx, input }) =>
        translateRepositoryErrors(() =>
          ctx.repository.updateProjectBrand(ctx.user.id, input, ctx.audit),
        ),
      ),
    remove: customerProcedure
      .input(z.object({ projectId: idSchema }))
      .output(booleanResultOutputSchemas.deleted)
      .mutation(async ({ ctx, input }) => {
        await translateRepositoryErrors(() =>
          ctx.repository.softDeleteProject(
            ctx.user.id,
            input.projectId,
            ctx.audit,
          ),
        );
        return { deleted: true };
      }),
    restore: customerProcedure
      .input(z.object({ projectId: idSchema }))
      .output(booleanResultOutputSchemas.projectRestored)
      .mutation(async ({ ctx, input }) => {
        await translateRepositoryErrors(() =>
          ctx.repository.restoreProject(
            ctx.user.id,
            input.projectId,
            ctx.audit,
          ),
        );
        return { restored: true, schedulesPaused: true };
      }),
  }),
platforms: t.router({
    list: customerProcedure
      .output(z.array(platformOutputSchema))
      .query(({ ctx }) => ctx.repository.listPlatforms(false)),
  }),
regions: t.router({
    list: customerProcedure
      .input(
        z
          .object({ scope: z.enum(["domestic", "overseas"]).optional() })
          .optional(),
      )
      .output(z.array(regionOutputSchema))
      .query(({ ctx, input }) => ctx.repository.listRegions(input?.scope)),
  }),
monitors: t.router({
    list: customerProcedure
      .input(z.object({ projectId: idSchema.optional() }).optional())
      .output(z.array(monitorListOutputSchema))
      .query(({ ctx, input }) =>
        ctx.repository.listMonitors(ctx.user.id, input?.projectId),
      ),
    listDeleted: customerProcedure
      .output(z.array(deletedMonitorOutputSchema))
      .query(({ ctx }) => ctx.repository.listDeletedMonitors(ctx.user.id)),
    get: customerProcedure
      .input(z.object({ monitorId: idSchema }))
      .output(monitorDetailOutputSchema)
      .query(({ ctx, input }) =>
        translateRepositoryErrors(() =>
          ctx.repository.getMonitor(ctx.user.id, input.monitorId),
        ),
      ),
    create: customerProcedure
      .input(monitorCreateInputSchema)
      .output(monitorMutationOutputSchema)
      .mutation(async ({ ctx, input }) => {
        if (input.runImmediately && !input.idempotencyKey)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Immediate runs require an idempotency key",
          });
        return translateRepositoryErrors(async () => {
          if (input.runImmediately && input.idempotencyKey) {
            return ctx.repository.createMonitorAndRun(
              ctx.user.id,
              input.projectId,
              input.configuration,
              input.idempotencyKey,
              ctx.audit,
            );
          }
          const monitor = await ctx.repository.createMonitor(
            ctx.user.id,
            input.projectId,
            input.configuration,
            ctx.audit,
          );
          return { ...monitor, run: null };
        });
      }),
    update: customerProcedure
      .input(monitorUpdateInputSchema)
      .output(monitorMutationOutputSchema)
      .mutation(async ({ ctx, input }) => {
        if (input.runImmediately && !input.idempotencyKey)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Immediate runs require an idempotency key",
          });
        return translateRepositoryErrors(async () => {
          if (input.runImmediately && input.idempotencyKey) {
            return ctx.repository.updateMonitorAndRun(
              ctx.user.id,
              input.monitorId,
              input.configuration,
              input.idempotencyKey,
              ctx.audit,
            );
          }
          const monitor = await ctx.repository.updateMonitor(
            ctx.user.id,
            input.monitorId,
            input.configuration,
            ctx.audit,
          );
          return { ...monitor, run: null };
        });
      }),
    pause: customerProcedure
      .input(z.object({ monitorId: idSchema }))
      .output(booleanResultOutputSchemas.monitorPaused)
      .mutation(async ({ ctx, input }) => {
        await translateRepositoryErrors(() =>
          ctx.repository.setMonitorPaused(
            ctx.user.id,
            input.monitorId,
            true,
            ctx.audit,
          ),
        );
        return { paused: true };
      }),
    resume: customerProcedure
      .input(z.object({ monitorId: idSchema }))
      .output(booleanResultOutputSchemas.monitorPaused)
      .mutation(async ({ ctx, input }) => {
        await translateRepositoryErrors(() =>
          ctx.repository.setMonitorPaused(
            ctx.user.id,
            input.monitorId,
            false,
            ctx.audit,
          ),
        );
        return { paused: false };
      }),
    remove: customerProcedure
      .input(z.object({ monitorId: idSchema }))
      .output(booleanResultOutputSchemas.deleted)
      .mutation(async ({ ctx, input }) => {
        await translateRepositoryErrors(() =>
          ctx.repository.softDeleteMonitor(
            ctx.user.id,
            input.monitorId,
            ctx.audit,
          ),
        );
        return { deleted: true };
      }),
    restore: customerProcedure
      .input(z.object({ monitorId: idSchema }))
      .output(booleanResultOutputSchemas.monitorRestored)
      .mutation(async ({ ctx, input }) => {
        await translateRepositoryErrors(() =>
          ctx.repository.restoreMonitor(
            ctx.user.id,
            input.monitorId,
            ctx.audit,
          ),
        );
        return { restored: true, schedulePaused: true };
      }),
    runNow: customerProcedure
      .input(runNowInputSchema)
      .output(runCreationResultOutputSchema)
      .mutation(({ ctx, input }) =>
        translateRepositoryErrors(() =>
          ctx.repository.createRun(
            ctx.user.id,
            input.monitorId,
            input.idempotencyKey,
          ),
        ),
      ),
  }),
monitoring: t.router({
    summary: customerProcedure
      .input(monitoringScopeSchema)
      .output(monitoringSummaryOutputSchema)
      .query(({ ctx, input }) =>
        translateRepositoryErrors(() =>
          ctx.repository.getMonitoringSummary(ctx.user.id, input),
        ),
      ),
    answers: t.router({
      list: customerProcedure
        .input(monitoringAnswersListInputSchema)
        .output(monitoringAnswersListOutputSchema)
        .query(({ ctx, input }) =>
          translateRepositoryErrors(() =>
            ctx.repository.listMonitoringAnswers(ctx.user.id, input),
          ),
        ),
      get: customerProcedure
        .input(monitoringAnswerGetInputSchema)
        .output(monitoringAnswerDetailOutputSchema)
        .query(({ ctx, input }) =>
          translateRepositoryErrors(() =>
            ctx.repository.getMonitoringAnswer(
              ctx.user.id,
              input.monitorId,
              input.answerId,
              input.subject,
            ),
          ),
        ),
    }),
    analysis: customerProcedure
      .input(monitoringAnalysisInputSchema)
      .output(monitoringAnalysisOutputSchema)
      .query(({ ctx, input }) =>
        translateRepositoryErrors(() =>
          ctx.repository.getMonitoringAnalysis(ctx.user.id, input),
        ),
      ),
  }),
runs: t.router({
    list: customerProcedure
      .input(
        z.object({
          monitorId: idSchema,
          limit: z.number().int().min(1).max(100).default(30),
        }),
      )
      .output(z.array(runListOutputSchema))
      .query(({ ctx, input }) =>
        ctx.repository.listRuns(ctx.user.id, input.monitorId, input.limit),
      ),
    listDeleted: customerProcedure
      .input(listInputSchema.optional())
      .output(z.array(deletedRunOutputSchema))
      .query(({ ctx, input }) =>
        ctx.repository.listDeletedRuns(ctx.user.id, input?.limit ?? 100),
      ),
    get: customerProcedure
      .input(z.object({ runId: idSchema }))
      .output(runDetailOutputSchema)
      .query(({ ctx, input }) =>
        translateRepositoryErrors(() =>
          ctx.repository.getRun(ctx.user.id, input.runId),
        ),
      ),
    cancel: customerProcedure
      .input(z.object({ runId: idSchema }))
      .output(runRecordOutputSchema)
      .mutation(async ({ ctx, input }) => {
        const run = await translateRepositoryErrors(() =>
          ctx.repository.cancelRun(ctx.user.id, input.runId, ctx.audit),
        );
        if (!run)
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Cancelled run could not be read back",
          });
        return run;
      }),
    remove: customerProcedure
      .input(z.object({ runId: idSchema }))
      .output(booleanResultOutputSchemas.deleted)
      .mutation(async ({ ctx, input }) => {
        await translateRepositoryErrors(() =>
          ctx.repository.softDeleteRun(ctx.user.id, input.runId, ctx.audit),
        );
        return { deleted: true };
      }),
    restore: customerProcedure
      .input(z.object({ runId: idSchema }))
      .output(booleanResultOutputSchemas.restored)
      .mutation(async ({ ctx, input }) => {
        await translateRepositoryErrors(() =>
          ctx.repository.restoreRun(ctx.user.id, input.runId, ctx.audit),
        );
        return { restored: true };
      }),
  })
},admin:{
overview: adminProcedure
      .output(adminOverviewOutputSchema)
      .query(({ ctx }) => ctx.repository.getAdminOverview()),
platforms: t.router({
      list: adminProcedure
        .output(z.array(platformOutputSchema))
        .query(({ ctx }) => ctx.repository.listPlatforms(true)),
      sync: adminProcedure
        .output(booleanResultOutputSchemas.queued)
        .mutation(async ({ ctx }) => {
          await ctx.repository.enqueueProviderCatalogSync(ctx.audit);
          return { queued: true };
        }),
      acceptance: t.router({
        plan: adminProcedure
          .input(platformAcceptancePlanInputSchema)
          .output(platformAcceptancePlanOutputSchema)
          .query(({ ctx, input }) =>
            translateRepositoryErrors(() =>
              ctx.repository.planPlatformAcceptance(input),
            ),
          ),
        start: adminProcedure
          .input(platformAcceptanceStartInputSchema)
          .output(platformAcceptanceBatchOutputSchema)
          .mutation(({ ctx, input }) => {
            const configuredBudget =
              ctx.config.MONITORING_ACCEPTANCE_MAX_TEN_THOUSANDTHS;
            if (configuredBudget <= 0n) {
              throw new TRPCError({
                code: "PRECONDITION_FAILED",
                message:
                  "MONITORING_ACCEPTANCE_MAX_TEN_THOUSANDTHS must be set before paid probes can start",
              });
            }
            if (
              BigInt(input.confirmedTotalAmountTenThousandths) >
              configuredBudget
            ) {
              throw new TRPCError({
                code: "PRECONDITION_FAILED",
                message:
                  "Confirmed acceptance quote exceeds the configured budget ceiling",
              });
            }
            return translateRepositoryErrors(() =>
              ctx.repository.startPlatformAcceptanceBatch(input, ctx.audit),
            );
          }),
        list: adminProcedure
          .input(platformAcceptanceListInputSchema.optional())
          .output(z.array(platformAcceptanceBatchOutputSchema))
          .query(({ ctx, input }) =>
            translateRepositoryErrors(() =>
              ctx.repository.listPlatformAcceptanceBatches(input?.limit ?? 30),
            ),
          ),
        get: adminProcedure
          .input(platformAcceptanceGetInputSchema)
          .output(platformAcceptanceBatchOutputSchema)
          .query(({ ctx, input }) =>
            translateRepositoryErrors(() =>
              ctx.repository.getPlatformAcceptanceBatch(input.batchId),
            ),
          ),
      }),
      upsert: adminProcedure
        .input(platformCapabilityInputSchema)
        .output(idSchema)
        .mutation(({ ctx, input }) =>
          translateRepositoryErrors(() =>
            ctx.repository.upsertPlatform(input, ctx.audit),
          ),
        ),
    }),
providerCosts: t.router({
      list: adminProcedure
        .input(listInputSchema.optional())
        .output(z.array(adminProviderCostOutputSchema))
        .query(({ ctx, input }) =>
          ctx.repository.listProviderCosts(input?.limit ?? 100),
        ),
    })
}};
}
