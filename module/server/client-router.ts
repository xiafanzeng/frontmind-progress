import { initTRPC } from '@trpc/server';
import type { BuiltRouter, CreateRootTypes, DecorateCreateRouterOptions, DefaultErrorShape, QueryProcedure, MutationProcedure, Router, ProcedureBuilder } from '@trpc/server/unstable-core-do-not-import';
import {createProgressRoutes} from './routes.js';
import type {ProgressRouteCore} from './route-core.js';
export function createProgressClientRouter<Context extends object>(core:ProgressRouteCore<Context>){return initTRPC.context<Context>().create().router(createProgressRoutes(core).customer);}
export type ProgressRouter=ReturnType<typeof createProgressClientRouter>;
