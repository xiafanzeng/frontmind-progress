import {trpc} from './trpc';
import {mapRunDetail,mapRunSummary} from './apiMappers';
import {shouldPollRun} from './runtimeState';
import RunDetailPage from './pages/RunDetailPage';
export function MonitoringRunPanel({runId}:{runId:string}){
 const utils=trpc.useUtils();
 const query=trpc.runs.get.useQuery({runId},{refetchInterval:state=>state.state.data&&shouldPollRun(state.state.data.run.status)?5000:false});
 const monitorId=query.data?.run.monitorId;
 const comparisons=trpc.runs.list.useQuery({monitorId:monitorId||'00000000-0000-0000-0000-000000000000',limit:100},{enabled:!!monitorId,refetchInterval:monitorId?15000:false});
 const cancel=trpc.runs.cancel.useMutation();
 if(query.isLoading)return <p role="status">正在读取运行结果…</p>;
 if(query.error)return <p role="alert">{query.error.message}</p>;
 const run=query.data?mapRunDetail(query.data):undefined;
 return <RunDetailPage embedded run={run} comparisonRuns={(comparisons.data||[]).map(item=>mapRunSummary(item,run?.monitorName||'问题监控',run?.version||1))} onCancel={async()=>{await cancel.mutateAsync({runId});await Promise.all([utils.runs.get.invalidate({runId}),utils.costs.summary.invalidate()]);}}/>;
}
