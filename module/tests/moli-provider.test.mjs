import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MoliClient, MoliConfigurationError, MoliHttpError, MoliSubmissionUnknownError, MOLI_API_PATHS } from '../dist/server/providers/moli/index.js';

const reply = (data, status=200) => new Response(JSON.stringify({code: status, data}), {status, headers:{'content-type':'application/json'}});
const input = {attemptId:'provider-contract-test',prompt:'test question',platform:'deepseek',clientType:'web',mode:'search',screenshot:0};

test('module client sends server-supplied credential and reads the model endpoint', async () => {
 const requests=[];
 const client=new MoliClient({token:'fixture-only-token',fetch:async(url,options)=>{requests.push({url:String(url),...options});return reply([{platform:'deepseek',name:'DeepSeek',clientType:'web'}]);}});
 const result=await client.listModels();
 assert.equal(requests.length,1);
 assert.equal(new URL(requests[0].url).pathname,MOLI_API_PATHS.models);
 assert.equal(requests[0].method,'GET');
 assert.equal(requests[0].headers.authorization,'Bearer fixture-only-token');
 assert.equal(result[0].platform,'deepseek');
});

test('one paid attempt uses one stable consumer id and never auto-resubmits on timeout', async () => {
 let calls=0;
 const client=new MoliClient({token:'fixture-only-token',fetch:async()=>{calls++;throw new Error('connection lost');}});
 await assert.rejects(client.submitSingleAttempt(input),error=>error instanceof MoliSubmissionUnknownError && Boolean(error.consumerTaskId));
 assert.equal(calls,1);
});

test('submission preserves request dimensions and provider task identity', async () => {
 let payload;
 const client=new MoliClient({token:'fixture-only-token',fetch:async(url,options)=>{assert.equal(new URL(url).pathname,MOLI_API_PATHS.submitTask);payload=JSON.parse(options.body);return reply({taskId:'task-123',totalTask:1,subTaskList:[{subTaskId:'sub-123'}]});}});
 const result=await client.submitSingleAttempt({...input,monitorKeyword:'Brand',regionCode:'CN'});
 assert.deepEqual(payload.prompts,['test question']);
 assert.deepEqual(payload.platforms,[{platform:'deepseek',mode:'search',screenshot:0}]);
 assert.deepEqual(payload.regionCode,['CN']);
 assert.equal(result.taskId,'task-123');assert.equal(result.subTaskId,'sub-123');
 assert.equal(result.consumerTaskId,payload.consumerTaskId);
});

test('missing and rejected credentials are explicit failures',async()=>{
 assert.throws(()=>new MoliClient({token:''}),MoliConfigurationError);
 const client=new MoliClient({token:'fixture-only-token',fetch:async()=>reply({},401)});
 await assert.rejects(client.listModels(),MoliHttpError);
});

test('new server handlers can use runtime credentials without private host edits',async()=>{
 const {createMoliClientFromEnvironment}=await import('../dist/server/providers/moli/index.js');
 let observed;
 const client=createMoliClientFromEnvironment({MOLI_API_TOKEN:'fixture-runtime-token',MOLI_API_BASE_URL:'https://provider.test'},async(url,options)=>{observed={url:String(url),auth:options.headers.authorization};return reply([]);});
 await client.listModels();
 assert.equal(observed.url,'https://provider.test'+MOLI_API_PATHS.models);
 assert.equal(observed.auth,'Bearer fixture-runtime-token');
 assert.throws(()=>createMoliClientFromEnvironment({MOLI_API_TOKEN:'test',MOLI_TIMEOUT_MS:'NaN'}),MoliConfigurationError);
});

test('connection check reads models only and never returns credentials or raw payload',async()=>{
 const {checkMoliConnection}=await import('../dist/server/providers/moli/connection.js');
 const calls=[];
 const result=await checkMoliConnection({MOLI_API_TOKEN:'fixture-private-token'},async(url,options)=>{calls.push({url:String(url),method:options.method});return reply([{platform:'deepseek',name:'DeepSeek',clientType:'web',privateField:'omit-this'}]);});
 assert.deepEqual(result,{connected:true,provider:'moli',modelCount:1});
 assert.deepEqual(calls.map(c=>c.method),['GET']);
 assert.equal(JSON.stringify(result).includes('fixture-private-token'),false);
});
