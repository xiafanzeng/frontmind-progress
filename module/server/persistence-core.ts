import type { SQL, SQLWrapper } from 'drizzle-orm';
import type { AnyMySqlColumn } from 'drizzle-orm/mysql-core';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import type { ProgressSchema } from '../schema/index.js';
export type ProgressDatabase = MySql2Database<any>;
export type ProgressTransaction = Parameters<Parameters<ProgressDatabase['transaction']>[0]>[0];
export type ProgressExecutor = ProgressDatabase | ProgressTransaction;
export type RequestAudit = { actorId:string|null; actorRole:'user'|'admin'|null; ipHash?:string|null };
export type ProgressPrice = {id:string;pricingVersionId:string;pricingClass:'domestic'|'overseas';mode:'search'|'reasoning_search';screenshotEnabled:boolean;amountTenThousandths:bigint};
export type ProgressWallet = {userId:string;balanceTenThousandths:bigint;reservedTenThousandths:bigint;frozenTenThousandths:bigint;spentTenThousandths:bigint};
export type ProgressMoneyEntry = {userId:string;type:'topup'|'admin_adjustment'|'reserve'|'consume'|'release';balanceDelta:bigint;reservedDelta:bigint;nextBalance:bigint;nextReserved:bigint;idempotencyKey:string;reason:string;reservationId?:string;attemptId?:string;actorId?:string|null;referenceType?:string;referenceId?:string;metadata?:Record<string,unknown>};
/** Core owns identities and unified funds; every call receives the same business transaction. */
export interface ProgressRepositoryCore {
 tables: ProgressSchema;
 currentMonitoringEnterpriseProjectId():string|null;
 monitoringProjectOwnerPredicate(table:{ownerId:AnyMySqlColumn;enterpriseProjectId:AnyMySqlColumn},ownerId:string|SQLWrapper):SQL;
 monitoringChildOwnerPredicate(table:{ownerId:AnyMySqlColumn;projectId:AnyMySqlColumn},ownerId:string|SQLWrapper):SQL;
 assertMonitoringEnterpriseProjectActive(tx:ProgressExecutor,projectId:string|null,ownerId:string):Promise<void>;
 assertOwnerActive(tx:ProgressExecutor,ownerId:string):Promise<void>;
 activePricing(tx:ProgressExecutor):Promise<{pricingVersion:{id:string};activePrices:ProgressPrice[]}>;
 lockMoneyWallet(tx:ProgressExecutor,userId:string):Promise<ProgressWallet>;
 reserveFunds(tx:ProgressExecutor,input:{ownerId:string;runId:string;reservationId:string;reservedAmount:bigint;nextReservedAmount:bigint}):Promise<void>;
 insertMoneyLedger(tx:ProgressExecutor,input:ProgressMoneyEntry):Promise<void>;
 insertAudit(tx:ProgressExecutor,audit:RequestAudit,action:string,targetType:string,targetId:string|null,ownerId:string|null,metadata:Record<string,unknown>):Promise<void>;
 settleAttemptMoney(tx:ProgressExecutor,input:{attemptId:string;settlement:'consumed'|'released';settledAt:Date;reason:string}):Promise<boolean>;
 MONEY_CURRENCY:'CNY';
 moneyToApiString(value:bigint):string;
}
export interface ProgressWorkerCore extends ProgressRepositoryCore {
 monitoringRepository(db:ProgressDatabase):{createRun(ownerId:string,monitorId:string,idempotencyKey:string,trigger:'manual'|'scheduled'|'catch_up',occurrenceId:string|null,monitorVersionOverrideId:string|null):Promise<{run:ProgressSchema['runs']['$inferSelect'];duplicate:boolean}>};
 syncDashboardMonitoringAccountStates(db:ProgressDatabase):Promise<unknown>;
 officialPricingClassForKnownProvider(code:string):'domestic'|'overseas'|null;
 activeOwnerCondition(ownerColumn:AnyMySqlColumn):SQL;
 cleanupIdentityRetention(db:ProgressDatabase,through:Date):Promise<void>;
 detachAttemptFunds(tx:ProgressExecutor,attemptIds:string[]):Promise<void>;
 detachRunFunds(tx:ProgressExecutor,runIds:string[]):Promise<void>;
}
