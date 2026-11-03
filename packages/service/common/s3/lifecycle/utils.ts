/** 仅接受完整知识库目录；尾部斜线隔离相邻对象，不允许扩大为所有 dataset。 */
export const isDatasetCleanupPrefix = (prefix: string) => /^dataset\/[a-f0-9]{24}\/$/.test(prefix);

/** 从服务端已确认的知识库 ID 生成持久化清理范围，不能接收任意用户 prefix。 */
export const getDatasetCleanupPrefix = (datasetId: string) => {
  const prefix = `dataset/${datasetId}/`;
  if (!isDatasetCleanupPrefix(prefix)) throw new Error('Invalid dataset cleanup scope');
  return prefix;
};

/** 旧源文件清理只能指向某个知识库内的具体对象，新正文图片保留集合目录生命周期。 */
export const isDatasetFileCleanupKey = (key: string) =>
  /^dataset\/[a-f0-9]{24}\/(?!chunk-images\/).+$/s.test(key);
