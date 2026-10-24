import {useState,useEffect,useCallback,useRef,type ReactNode} from 'react';
import {useLocation,useSearch} from 'wouter';
import {progressRunRoute} from './features/monitoring/reportNavigation';
import {writeMonitoringProjectSelection} from './features/monitoring/queryState';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {trpc,createTrpcClient} from './trpc';
import MonitoringPage from './pages/MonitoringPage';
import {MonitoringRunPanel} from './RunPanel';
import Modal from './components/Modal';
import ProjectForm from './components/ProjectForm';
import {mapProject,mapProviderModel,mapRegion,mapMonitor,mapRunSummary,mapRunDetail,monitorInputToConfiguration,monitorDetailToInput} from './apiMappers';
import type {MonitorInput,ProjectSummary} from './domain';
import './styles.css';
import './integration.css';
import './features/monitoring/progress-brand.css';
export interface ModuleContext {module:'progress';workspace:{id:string;ownerUserId:number};capabilities:string[];marketEdition?:string}
export function ProgressClientProvider({children}:{children:ReactNode}){
 const [queryClient]=useState(()=>new QueryClient({defaultOptions:{queries:{retry:1,refetchOnWindowFocus:false}}}));
 const [client]=useState(createTrpcClient);
 return <QueryClientProvider client={queryClient}><trpc.Provider client={client} queryClient={queryClient}>{children}</trpc.Provider></QueryClientProvider>;
}
export type ProgressWorkspaceView = 'monitoring'|'reports';
export default function ModuleWorkspace({context,view,onViewChange}:{context?:ModuleContext;view?:ProgressWorkspaceView;onViewChange?:(view:ProgressWorkspaceView)=>void}){return <ProgressClientProvider><ProgressWorkspaceEntry key={context?.workspace.id} view={view} onViewChange={onViewChange}/></ProgressClientProvider>;}
function ProgressWorkspaceEntry(props:{view?:ProgressWorkspaceView;onViewChange?:(view:ProgressWorkspaceView)=>void}){
 return <div className="monitoring-workspace-root"><LiveProgressWorkspace {...props}/></div>;
}
function LiveProgressWorkspace({view,onViewChange}:{view?:ProgressWorkspaceView;onViewChange?:(view:ProgressWorkspaceView)=>void}){
 const [path,navigate]=useLocation();
 const search=useSearch();
 const params=new URLSearchParams(search);
 const route=progressRunRoute(path);
 const routeRunId=route?.runId;
 const routeMonitor=trpc.monitors.get.useQuery({monitorId:route?.monitorId||'00000000-0000-0000-0000-000000000000'},{enabled:!!route,staleTime:60000});
 const utils=trpc.useUtils();
 const projectsQuery=trpc.projects.list.useQuery();
 const platformsQuery=trpc.platforms.list.useQuery();
 const regionsQuery=trpc.regions.list.useQuery();
 const costs=trpc.costs.summary.useQuery();
 const projects=(projectsQuery.data||[]).map(mapProject);
 const requestedProjectId=params.get('project')||routeMonitor.data?.monitor.projectId;
 const project=requestedProjectId?projects.find(item=>item.id===requestedProjectId):route?undefined:projects[0];
 const [selectedRunId,setSelectedRunId]=useState(()=>new URLSearchParams(location.search).get('run')||undefined);
 const [localReport,setLocalReport]=useState(false);
 const report=view?view==='reports':localReport;
 const setReport=(value:boolean|((previous:boolean)=>boolean))=>{const next=typeof value==='function'?value(report):value;setLocalReport(next);onViewChange?.(next?'reports':'monitoring');};
 const [projectCreateOpen,setProjectCreateOpen]=useState(false);
 const [projectCreateError,setProjectCreateError]=useState('');
 const [projectCreateSubmitting,setProjectCreateSubmitting]=useState(false);
 const projectCreatePending=useRef(false);
 const monitorsQuery=trpc.monitors.list.useQuery({projectId:project?.id||'00000000-0000-0000-0000-000000000000'},{enabled:!!project,refetchInterval:10000});
 const deleted=trpc.monitors.listDeleted.useQuery(undefined,{enabled:!!project});
 const monitors=(monitorsQuery.data||[]).map(mapMonitor);
 const models=(platformsQuery.data||[]).map(mapProviderModel);
 const requestedMonitorId=route?.monitorId||params.get('monitor');
 const selectedMonitor=requestedMonitorId?monitors.find(m=>m.id===requestedMonitorId):monitors.find(m=>m.lastRun?.id===selectedRunId)||monitors.find(m=>m.lastRun);
 const runId=routeRunId||params.get('run')||selectedRunId||selectedMonitor?.lastRun?.id;
 const runQuery=trpc.runs.get.useQuery({runId:runId||'00000000-0000-0000-0000-000000000000'},{enabled:!!runId,refetchInterval:10000});
 const runs=trpc.runs.list.useQuery({monitorId:selectedMonitor?.id||'00000000-0000-0000-0000-000000000000',limit:100},{enabled:!!selectedMonitor,refetchInterval:15000});
 const createProject=trpc.projects.create.useMutation(), updateProject=trpc.projects.update.useMutation(),createMonitor=trpc.monitors.create.useMutation(),updateMonitor=trpc.monitors.update.useMutation(),runNow=trpc.monitors.runNow.useMutation(),pause=trpc.monitors.pause.useMutation(),resume=trpc.monitors.resume.useMutation(),remove=trpc.monitors.remove.useMutation(),restore=trpc.monitors.restore.useMutation(),quote=trpc.costs.quote.useMutation();
 const quoteRunCost=useCallback((input: Parameters<typeof quote.mutateAsync>[0])=>quote.mutateAsync(input),[quote.mutateAsync]);
 const refresh=async()=>{await Promise.all([utils.projects.list.invalidate(),utils.monitors.invalidate(),utils.runs.invalidate(),utils.monitoring.invalidate(),utils.costs.summary.invalidate()]);};
 const changeProject=(id:string)=>{
  writeMonitoringProjectSelection(id);setSelectedRunId(undefined);setReport(false);
  if(routeRunId&&!onViewChange)navigate(`/${location.search}`);
 };
 const routeMismatch=Boolean(route&&routeMonitor.data&&requestedProjectId&&routeMonitor.data.monitor.projectId!==requestedProjectId);
 const routeReady=!route||Boolean(routeMonitor.data&&!routeMismatch&&params.get('project')===routeMonitor.data.monitor.projectId&&params.get('monitor')===route.monitorId&&params.get('run')===route.runId);
 useEffect(()=>{
  if(!route||!routeMonitor.data||routeMismatch||routeReady)return;
  const next=new URLSearchParams(location.search);
  next.set('project',routeMonitor.data.monitor.projectId);next.set('monitor',route.monitorId);next.set('run',route.runId);next.set('view','reports');
  navigate(`${path}?${next}${location.hash}`,{replace:true});
 },[path,search,routeMonitor.data,routeMismatch,routeReady,navigate]);
 const addProject=async(value:Omit<ProjectSummary,'id'>)=>{
  const created=await createProject.mutateAsync({name:value.name,mainBrand:value.brandName,aliases:value.brandAliases,competitors:value.competitors,timezone:value.timezone});
  changeProject(created.id);
  await refresh();
 };
 const closeProjectCreate=()=>{if(!projectCreatePending.current)setProjectCreateOpen(false);};
 const submitProjectCreate=async(value:Omit<ProjectSummary,'id'>)=>{
  if(projectCreatePending.current)return;
  projectCreatePending.current=true;setProjectCreateSubmitting(true);setProjectCreateError('');
  try{await addProject(value);setProjectCreateOpen(false);}
  catch(error){setProjectCreateError(error instanceof Error?error.message:'创建项目失败，请重试。');}
  finally{projectCreatePending.current=false;setProjectCreateSubmitting(false);}
 };
 const save=async(value:MonitorInput,runImmediately:boolean,idempotencyKey?:string,id?:string)=>{
  if(!project)throw new Error('请先创建监控项目');
  const configuration=monitorInputToConfiguration(value,project,models);
  const result=id?await updateMonitor.mutateAsync({monitorId:id,configuration,runImmediately,idempotencyKey}):await createMonitor.mutateAsync({projectId:project.id,configuration,runImmediately,idempotencyKey});
  await refresh();return {monitorId:id||('monitorId'in result?result.monitorId:''),runId:result.run?.run.id};
 };
 const error=projectsQuery.error||platformsQuery.error||regionsQuery.error||monitorsQuery.error;
 if(route&&routeMonitor.error)return <p role="alert">无法读取该运行所属监控：{routeMonitor.error.message}</p>;
 if(routeMismatch)return <p role="alert">链接的项目与运行所属监控不一致，请从正确项目重新打开运行。</p>;
 if(route&&runQuery.data&&runQuery.data.run.monitorId!==route.monitorId)return <p role="alert">链接中的运行不属于当前监控，请核对运行链接。</p>;
 if(!routeReady)return <p role="status">正在恢复运行所属项目与监控…</p>;
 if(requestedProjectId&&projectsQuery.isSuccess&&!project)return <p role="alert">当前项目不存在或无权访问。</p>;
 return <div className="monitoring-module">{error&&<p role="alert">{error.message}</p>}<MonitoringPage key={project?.id} configurationTools={<div className="fm-config-project-picker"><label className="module-project-picker">当前项目 <select value={project?.id||''} onChange={event=>{changeProject(event.target.value);}}>{projects.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><button type="button" className="fm-secondary-button" onClick={()=>{setProjectCreateError('');setProjectCreateOpen(true);}}>创建项目</button></div>} renderReport={report||routeRunId?(currentRunId)=>currentRunId?<MonitoringRunPanel runId={currentRunId}/>:<div className="boot-state" role="status">暂无运行报告。完成一次监控后，可在这里查看回答、引用和报告。</div>:undefined} serverData project={project} monitors={monitors} deletedMonitors={(deleted.data||[]).filter(item=>item.projectId===project?.id)} models={models} regions={(regionsQuery.data||[]).map(mapRegion)} availableBalanceTenThousandths={costs.data?.availableTenThousandths||'0'} quoteRunCost={quoteRunCost} quoteMonitorRunCost={monitorId=>utils.costs.quoteMonitor.fetch({monitorId})} loading={projectsQuery.isPending||platformsQuery.isPending||!!project&&monitorsQuery.isPending} latestRun={runQuery.data?mapRunDetail(runQuery.data):undefined} recentRuns={(runs.data||[]).map(item=>mapRunSummary(item,selectedMonitor?.name||'问题监控',selectedMonitor?.activeVersion||1))} selectedRunId={runId} onSelectedRunChange={setSelectedRunId} onSelectedMonitorChange={monitor=>setSelectedRunId(monitor?.lastRun?.id)} onCreateProject={addProject} onUpdateProject={async value=>{if(!project)return;await updateProject.mutateAsync({projectId:project.id,name:value.name,mainBrand:value.brandName,aliases:value.brandAliases,competitors:value.competitors,timezone:value.timezone});await refresh();}} onSaveMonitor={(value,runNow,key)=>save(value,runNow,key)} onUpdateMonitor={(id,value,runNow,key)=>save(value,runNow,key,id)} onLoadMonitor={async id=>monitorDetailToInput(await utils.monitors.get.fetch({monitorId:id}),models)} onRunMonitor={async id=>{const result=await runNow.mutateAsync({monitorId:id,idempotencyKey:crypto.randomUUID()});await refresh();setSelectedRunId(result.run.id);return {runId:result.run.id};}} onToggleMonitor={async(id,paused)=>{await (paused?pause:resume).mutateAsync({monitorId:id});await refresh();}} onDeleteMonitor={async id=>{await remove.mutateAsync({monitorId:id});await refresh();}} onRestoreMonitor={async id=>{await restore.mutateAsync({monitorId:id});await refresh();}} onRefresh={refresh}/><div id="monitoring-module-portals"/><Modal open={projectCreateOpen} onClose={closeProjectCreate} title="创建项目" description="一个项目对应一个主监控品牌，历史运行保留当时的品牌版本。" size="large">{projectCreateError&&<p className="form-error modal-error" role="alert">{projectCreateError}</p>}<ProjectForm submitting={projectCreateSubmitting} onCancel={closeProjectCreate} onSubmit={submitProjectCreate}/></Modal></div>;
}
