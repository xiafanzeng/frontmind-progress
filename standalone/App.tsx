import './standalone.css';
import {useEffect,useState} from 'react';
import MonitoringDemo from './MonitoringDemo';
import ModuleWorkspace,{ProgressClientProvider,type ModuleContext} from '../module/client/ModuleWorkspace';
export default function App({preview=false}:{preview?:boolean}){
 const [context,setContext]=useState<ModuleContext>();const [error,setError]=useState('');
 useEffect(()=>{if(preview)return;const abort=new AbortController();void fetch('/api/module/context',{credentials:'same-origin',signal:abort.signal}).then(async response=>{if(!response.ok)throw new Error('开发门禁验证失败，请重新打开页面');return response.json();}).then(value=>{if(value.module!=='progress'||!value.workspace?.id)throw new Error('模块运行上下文无效');setContext(value);}).catch(cause=>{if(!abort.signal.aborted)setError(cause.message);});return()=>abort.abort();},[preview]);
 if(error)return <main><h1>问题监控</h1><p role="alert">{error}</p><button onClick={()=>location.reload()}>重新加载</button></main>;
 if(!preview&&!context)return <p role="status">正在进入问题监控…</p>;
 return preview?<ProgressClientProvider><MonitoringDemo/></ProgressClientProvider>:<ModuleWorkspace context={context}/>;
}
