import type {ProgressRouter} from '../server/client-router';
import {httpBatchLink} from '@trpc/client';
import {createTRPCReact} from '@trpc/react-query';
import {createContext} from 'react';
export const trpc:ReturnType<typeof createTRPCReact<ProgressRouter>>=createTRPCReact<ProgressRouter>({context:createContext(null)});
export function createTrpcClient(){return trpc.createClient({links:[httpBatchLink({url:'/api/monitoring/trpc',fetch:(url,options)=>fetch(url,{...options,credentials:'same-origin'})})]});}
