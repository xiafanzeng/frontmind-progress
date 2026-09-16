import {useState,useEffect,useCallback,useRef,type ReactNode} from 'react';
import {useLocation} from 'wouter';
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
export interface ModuleContext {module:'progress';workspace:{id:string;ownerUserId:number};capabilities:string[];marketEdition?:string}
export function ProgressClientProvider({children}:{children:ReactNode}){
 const [queryClient]=useState(()=>new QueryClient({defaultOptions:{queries:{retry:1,refetchOnWindowFocus:false}}}));
 const [client]=useState(createTrpcClient);
 return <QueryClientProvider client={queryClient}><trpc.Provider client={client} queryClient={queryClient}>{children}</trpc.Provider></QueryClientProvider>;
}
export type ProgressWorkspaceView = 'monitoring'|'reports';
export default function ModuleWorkspace({context,view,onViewChange}:{context?:ModuleContext;view?:ProgressWorkspaceView;onViewChange?:(view:ProgressWorkspaceView)=>void}){return <ProgressClientProvider><LiveProgressWorkspace key={context?.workspace.id} view={view} onViewChange={onViewChange}/></ProgressClientProvider>;}
function LiveProgressWorkspace({view,onViewChange}:{view?:ProgressWorkspaceView;onViewChange?:(view:ProgressWorkspaceView)=>void}){
 const [path,navigate]=useLocation();
 const routeRunId=/\/runs\/([0-9a-f-]{36})$/.exec(path)?.[1];
 const utils=trpc.useUtils();
 const projectsQuery=trpc.projects.list.useQuery();
 const platformsQuery=trpc.platforms.list.useQuery();
 const regionsQuery=trpc.regions.list.useQuery();
 const costs=trpc.costs.summary.useQuery();
 const projects=(projectsQuery.data||[]).map(mapProject);
 const [projectId,setProjectId]=useState(()=>new URLSearchParams(location.search).get('project')||'');
 const project=projects.find(item=>item.id===projectId)||projects[0];
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
 const selectedMonitor=monitors.find(m=>m.lastRun?.id===selectedRunId)||monitors.find(m=>m.lastRun);
 const runId=routeRunId||selectedRunId||selectedMonitor?.lastRun?.id;
 const runQuery=trpc.runs.get.useQuery({runId:runId||'00000000-0000-0000-0000-000000000000'},{enabled:!!runId,refetchInterval:10000});
 const runs=trpc.runs.list.useQuery({monitorId:selectedMonitor?.id||'00000000-0000-0000-0000-000000000000',limit:100},{enabled:!!selectedMonitor,refetchInterval:15000});
 const createProject=trpc.projects.create.useMutation(), updateProject=trpc.projects.update.useMutation(),createMonitor=trpc.monitors.create.useMutation(),updateMonitor=trpc.monitors.update.useMutation(),runNow=trpc.monitors.runNow.useMutation(),pause=trpc.monitors.pause.useMutation(),resume=trpc.monitors.resume.useMutation(),remove=trpc.monitors.remove.useMutation(),restore=trpc.monitors.restore.useMutation(),quote=trpc.costs.quote.useMutation();
 const quoteRunCost=useCallback((input: Parameters<typeof quote.mutateAsync>[0])=>quote.mutateAsync(input),[quote.mutateAsync]);
 const refresh=async()=>{await Promise.all([utils.projects.list.invalidate(),utils.monitors.invalidate(),utils.runs.invalidate(),utils.monitoring.invalidate(),utils.costs.summary.invalidate()]);};
 const addProject=async(value:Omit<ProjectSummary,'id'>)=>{
  const created=await createProject.mutateAsync({name:value.name,mainBrand:value.brandName,aliases:value.brandAliases,competitors:value.competitors,timezone:value.timezone});
  setProjectId(created.id);setSelectedRunId(undefined);setReport(false);
  if(routeRunId)navigate('/');
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
 return <div className="monitoring-module"><header className="fm-demo-header module-toolbar"><h1>问题监控</h1><div><label className="module-project-picker">监控项目 <select value={project?.id||''} onChange={event=>{setProjectId(event.target.value);setSelectedRunId(undefined);setReport(false);}}>{projects.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><button type="button" className="fm-secondary-button" onClick={()=>{setProjectCreateError('');setProjectCreateOpen(true);}}>创建项目</button>{runId&&<button className="fm-secondary-button" onClick={()=>{setReport(value=>!value);if(routeRunId)navigate("/");}}>{report||routeRunId?'返回监控':'查看运行报告'}</button>}</div></header>{error&&<p role="alert">{error.message}</p>}{report||routeRunId?runId?<MonitoringRunPanel runId={runId}/>:<div className="boot-state" role="status">暂无运行报告。完成一次监控后，可在这里查看回答、引用和报告。</div>:<MonitoringPage serverData project={project} monitors={monitors} deletedMonitors={(deleted.data||[]).filter(item=>item.projectId===project?.id)} models={models} regions={(regionsQuery.data||[]).map(mapRegion)} availableBalanceTenThousandths={costs.data?.availableTenThousandths||'0'} quoteRunCost={quoteRunCost} quoteMonitorRunCost={monitorId=>utils.costs.quoteMonitor.fetch({monitorId})} loading={projectsQuery.isPending||platformsQuery.isPending||!!project&&monitorsQuery.isPending} latestRun={runQuery.data?mapRunDetail(runQuery.data):undefined} recentRuns={(runs.data||[]).map(item=>mapRunSummary(item,selectedMonitor?.name||'问题监控',selectedMonitor?.activeVersion||1))} selectedRunId={runId} onSelectedRunChange={setSelectedRunId} onSelectedMonitorChange={monitor=>setSelectedRunId(monitor?.lastRun?.id)} onCreateProject={addProject} onUpdateProject={async value=>{if(!project)return;await updateProject.mutateAsync({projectId:project.id,name:value.name,mainBrand:value.brandName,aliases:value.brandAliases,competitors:value.competitors,timezone:value.timezone});await refresh();}} onSaveMonitor={(value,runNow,key)=>save(value,runNow,key)} onUpdateMonitor={(id,value,runNow,key)=>save(value,runNow,key,id)} onLoadMonitor={async id=>monitorDetailToInput(await utils.monitors.get.fetch({monitorId:id}),models)} onRunMonitor={async id=>{const result=await runNow.mutateAsync({monitorId:id,idempotencyKey:crypto.randomUUID()});await refresh();setSelectedRunId(result.run.id);return {runId:result.run.id};}} onToggleMonitor={async(id,paused)=>{await (paused?pause:resume).mutateAsync({monitorId:id});await refresh();}} onDeleteMonitor={async id=>{await remove.mutateAsync({monitorId:id});await refresh();}} onRestoreMonitor={async id=>{await restore.mutateAsync({monitorId:id});await refresh();}} onRefresh={refresh}/>}<div id="monitoring-module-portals"/><Modal open={projectCreateOpen} onClose={closeProjectCreate} title="创建项目" description="一个项目对应一个主监控品牌，历史运行保留当时的品牌版本。" size="large">{projectCreateError&&<p className="form-error modal-error" role="alert">{projectCreateError}</p>}<ProjectForm submitting={projectCreateSubmitting} onCancel={closeProjectCreate} onSubmit={submitProjectCreate}/></Modal></div>;
}
