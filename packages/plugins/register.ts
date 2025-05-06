import { cloneDeep } from 'lodash';

// Run in main thread
// const staticPluginList = [
//   'getTime',
//   'fetchUrl',
//   'feishu',
//   'DingTalkWebhook',
//   'WeWorkWebhook',
//   'google',
//   'bing',
//   'delay'
// ];
// // Run in worker thread (Have npm packages)
// const packagePluginList = [
//   'mathExprVal',
//   'duckduckgo',
//   'duckduckgo/search',
//   'duckduckgo/searchImg',
//   'duckduckgo/searchNews',
//   'duckduckgo/searchVideo',
//   'drawing',
//   'drawing/baseChart',
//   'wiki',
//   'databaseConnection',
//   'Doc2X',
//   'Doc2X/PDF2text',
//   'searchXNG',
//   'smtpEmail'
// ];

// export const list = [...staticPluginList, ...packagePluginList];

/* Get plugins */

// return Promise.all(
//   list.map<Promise<SystemPluginTemplateItemType>>(async (name) => {
//     const config = (await import(`./src/${name}/template.json`))?.default;
//     const isFolder = list.find((item) => item.startsWith(`${name}/`));
//     const parentIdList = name.split('/').slice(0, -1);
//     const parentId =
//       parentIdList.length > 0 ? `${PluginSourceEnum.community}-${parentIdList.join('/')}` : null;
//     return {
//       ...config,
//       id: `${PluginSourceEnum.community}-${name}`,
//       isFolder,
//       parentId,
//       isActive: true,
//       isOfficial: true
//     };
//   })
// );

export const getSystemPluginTemplates = () => {
  if (!global.systemPlugins) return [];

  return cloneDeep(global.systemPlugins);
};

// export const getCommunityCb = async () => {
//   const loadCommunityModule = async (name: string) => {
//     const module = await import(`./src/${name}/index`);
//     return module.default;
//   };

//   const result = (
//     await Promise.all(
//       list.map(async (name) => {
//         try {
//           return {
//             name,
//             cb: staticPluginList.includes(name)
//               ? await loadCommunityModule(name)
//               : (e: any) => {
//                   return runWorker(WorkerNameEnum.systemPluginRun, {
//                     pluginName: name,
//                     data: e
//                   });
//                 }
//           };
//         } catch (error) {}
//       })
//     )
//   ).filter(Boolean) as {
//     name: string;
//     cb: any;
//   }[];

//   return result.reduce<Record<string, (e: any) => SystemPluginResponseType>>(
//     (acc, { name, cb }) => {
//       acc[name] = cb;
//       return acc;
//     },
//     {}
//   );
// };
