// 'use server';
// import type { SystemPluginTemplateItemType } from '@fastgpt/global/core/workflow/type';
// import type { ToolSetType, ToolType } from '@fastgpt/global/core/workflow/type/tool';
// import fs from 'fs';
// import path from 'path';
// import { formatToolList } from './format';
// export const toolsDir = path.resolve(process.env.TOOLS_DIR || path.join(process.cwd(), 'tools'));
// import { cloneDeep } from 'lodash';
// import * as Comlink from 'comlink/dist/esm/comlink';
// import nodeEndpoint from 'comlink/dist/esm/node-adapter';
// import { Worker } from 'worker_threads';
// // import { getWorker } from '@fastgpt/service/worker/utils';

// // const worker = getWorker('systemPluginRun');
// const workerPath = path.join(process.cwd(), '.next', 'server', 'worker', `systemPluginRun.js`);
// const worker = new Worker(workerPath);
// const api = Comlink.wrap<{
//   runTool: (cb: (data: any) => void, input: object) => any;
//   getTools: () => Promise<SystemPluginTemplateItemType[]>;
// }>(nodeEndpoint(worker));

// // const worker = new Worker(new URL('./worker.ts', import.meta.url), {
// //   type: 'module'
// // });

// /**
//  * Get Tool List without cb
//  */
// export async function getSystemToolList() {
//   const res = await api.getTools();
//   worker.terminate();
//   console.log('res', res);
// }

// /**
//  * Run Tool
//  */
// export async function runTool(toolId: string, input: object) {
//   // const tool = tools.find((item) => item.toolId === toolId);
//   // const cb = tool?.cb;
//   // if (!cb) return Promise.reject(new Error('tool callback not found'));
//   // return api.runTool(cb, input);
// }

// export const getSystemPluginTemplates = () => {
//   if (!global.systemPlugins) return [];

//   return cloneDeep(global.systemPlugins);
// };
