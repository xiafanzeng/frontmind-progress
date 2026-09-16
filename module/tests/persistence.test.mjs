import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sql} from 'drizzle-orm';
import {mysqlTable,varchar} from 'drizzle-orm/mysql-core';
import {createProgressSchema} from '../dist/schema/index.js';
import {createProgressRepository} from '../dist/server/monitoring-repository.js';

function fixture(reads) {
 const tables=createProgressSchema({users:mysqlTable('test_users',{id:varchar('id',{length:36}).primaryKey()}),currentMonitoringEnterpriseProjectId:()=> 'workspace'});
 const committed=[], staged=[], calls=[];
 const tx={select(){const query={};for(const method of ['from','innerJoin','where','limit','for','orderBy'])query[method]=()=>query;query.then=(resolve,reject)=>Promise.resolve(reads.shift()??[]).then(resolve,reject);return query;},insert(table){return {values(value){staged.push({table,value});return Promise.resolve();}};}};
 const db={async transaction(operation){try{const result=await operation(tx);committed.push(...staged);return result;}catch(error){staged.length=0;throw error;}}};
 const core={tables,currentMonitoringEnterpriseProjectId:()=> 'workspace',monitoringProjectOwnerPredicate:()=>sql`true`,monitoringChildOwnerPredicate:()=>sql`true`,async assertMonitoringEnterpriseProjectActive(executor){assert.equal(executor,tx);},async assertOwnerActive(executor){assert.equal(executor,tx);},async lockMoneyWallet(executor){assert.equal(executor,tx);return {userId:'owner',balanceTenThousandths:100n,reservedTenThousandths:0n,frozenTenThousandths:0n,spentTenThousandths:0n};},async activePricing(executor){assert.equal(executor,tx);return {pricingVersion:{id:'price-version'},activePrices:[{id:'price-item',pricingVersionId:'price-version',pricingClass:'domestic',mode:'search',screenshotEnabled:false,amountTenThousandths:1n}]};},async reserveFunds(executor,input){assert.equal(executor,tx);calls.push(input);throw new Error('funds write failed');},insertMoneyLedger(){throw new Error('ledger should not run');},insertAudit:async()=>{},settleAttemptMoney:async()=>false,MONEY_CURRENCY:'CNY',moneyToApiString:String};
 const {ProgressRepository}=createProgressRepository(core);
 return {repository:new ProgressRepository(db),committed,calls};
}

test('an idempotent run retry reads the existing run without reserving again',async()=>{
 const existing={id:'existing',monitorId:'monitor'};
 const f=fixture([[{enterpriseProjectId:'workspace'}],[existing]]);
 assert.deepEqual(await f.repository.createRun('owner','monitor','key'),{run:existing,duplicate:true});
 assert.equal(f.calls.length,0);assert.equal(f.committed.length,0);
});

test('a run key cannot be rebound to another monitor',async()=>{
 const f=fixture([[{enterpriseProjectId:'workspace'}],[{id:'existing',monitorId:'other'}]]);
 await assert.rejects(()=>f.repository.createRun('owner','monitor','key'),{code:'CONFLICT'});
 assert.equal(f.calls.length,0);assert.equal(f.committed.length,0);
});

test('funds failure rolls back run and attempts before any queue is committed',async()=>{
 const platform={id:'platform',providerCode:'deepseek',displayName:'DeepSeek',clientType:'web',enabled:true,verified:true,supportsReasoning:false,supportsScreenshot:false,supportsDomesticRegion:false,supportsOverseasRegion:false,acceptanceRequired:false,acceptanceFingerprint:null,providerMetadata:null};
 const f=fixture([
  [{enterpriseProjectId:'workspace'}],[],
  [{id:'monitor',projectId:'project',activeVersionId:'version',status:'active'}],[],
  [{id:'version',monitorId:'monitor',projectBrandVersionId:'brand',repetitions:1,expectedAttempts:1}],
  [{id:'project',currentBrandVersionId:'brand'}],[{id:'brand'}],[],
  [{ordinal:1,questionSnapshot:'test question'}],
  [{ordinal:1,platformId:'platform',providerCodeSnapshot:'deepseek',clientType:'web',mode:'search',screenshot:0,regionCode:null,pricingClass:'domestic'}],
  [platform],[],
 ]);
 await assert.rejects(()=>f.repository.createRun('owner','monitor','key'),/funds write failed/);
 assert.equal(f.calls.length,1);assert.equal(f.calls[0].reservedAmount,1n);assert.equal(f.committed.length,0);
});
