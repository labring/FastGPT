/**
 * 懒加载目录读屏障，避免同步 model getter、权限缓存和快照加载器形成初始化循环。
 * 仅用于请求/后台任务的异步入口，已有任务持有的模型对象不被原地修改。
 */
export const ensureModelCatalogReady = async () => {
  const { ensureSystemModelSnapshot } = await import('./utils');
  await ensureSystemModelSnapshot();
};
