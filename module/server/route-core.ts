import type {z} from 'zod';
import {billingQuoteInputSchema,billingQuoteOutputSchema,billingSummaryOutputSchema} from '@frontmind/monitoring-contracts';
import type {createProgressRepository} from './monitoring-repository.js';
import type {RequestAudit} from './persistence-core.js';
export type ProgressRepository=InstanceType<ReturnType<typeof createProgressRepository>['ProgressRepository']>;
export interface ProgressRouteContext {
 costs:{summary():Promise<z.infer<typeof billingSummaryOutputSchema>>;quote(input:z.infer<typeof billingQuoteInputSchema>):Promise<z.infer<typeof billingQuoteOutputSchema>>};
 user:{id:string};repository:ProgressRepository;audit:RequestAudit;
 config:{MONITORING_ACCEPTANCE_MAX_TEN_THOUSANDTHS:bigint};
}
export interface ProgressRouteCore<Context extends object>{authorize(context:Context,capability:'customer'|'admin'):Promise<ProgressRouteContext>}
