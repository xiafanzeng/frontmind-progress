import { createContext, useContext, type ReactNode } from 'react';
import type {MonitorRun} from './domain';
export type ProgressTaskResource={kind:string;id:string};
export interface ProgressTaskConnection {
 scopeKey:string;
 state?:{values:Record<string,unknown>;resources?:ProgressTaskResource[]}|null;
 ensureTask():Promise<string>;
 saveState(patch:{step?:string;values?:Record<string,unknown>;resources?:ProgressTaskResource[];outputRefs?:{resource:ProgressTaskResource;sourceStepId:string}[];record?:{id:string;label:string;status:string}},owner?:{scopeKey:string;conversationId:string}):Promise<unknown>;
}
export interface ProgressHostConnections {
 useBusinessWorkspace():{isWorkbench:boolean;task?:ProgressTaskConnection};
 activeEnterpriseProjectId():string|undefined;
 enterpriseProjectHeaders(headers?:Record<string,string>):Record<string,string>;
 projectResourceUrl(url:string):string;
 projectWorkspaceUrl(url:string,projectId?:string):string;
 renderExecution?(run:MonitorRun):ReactNode;
}
const defaults:ProgressHostConnections={useBusinessWorkspace:()=>({isWorkbench:false}),activeEnterpriseProjectId:()=>undefined,enterpriseProjectHeaders:(headers={})=>headers,projectResourceUrl:url=>url,projectWorkspaceUrl:url=>url};
let host:ProgressHostConnections=defaults;
/** Main configures its own identity/navigation integration. Public preview has no identity source. */
export function configureProgressHost(value:Partial<ProgressHostConnections>){host={...defaults,...value};}
export function useBusinessWorkspace(){return host.useBusinessWorkspace();}
export function activeEnterpriseProjectId(){return host.activeEnterpriseProjectId();}
export function enterpriseProjectHeaders(headers:Record<string,string>={}){return host.enterpriseProjectHeaders(headers);}
export function projectResourceUrl(url:string){return host.projectResourceUrl(url);}
export function projectWorkspaceUrl(url:string,projectId?:string){return host.projectWorkspaceUrl(url,projectId);}
export const MonitoringOutcomeControlsContext=createContext<ReactNode>(null);
export function ProgressExecutionActivity({run}:{run:MonitorRun}){return host.renderExecution?<>{host.renderExecution(run)}</>:<details className="business-execution-disclosure"><summary>查看过程</summary><p>运行状态：{run.status}</p><ul>{run.attempts.map(attempt=><li key={attempt.id}>{attempt.platformName} · {attempt.question} · {attempt.status}</li>)}</ul></details>;}
