/**
 * 默认召回只读取生成搜索结果所需字段。
 * 使用对象投影可以让字段增删更明确，也避免字符串投影在重构时难以 diff。
 */
export const datasetDataSelectField = {
  _id: 1,
  datasetId: 1,
  collectionId: 1,
  updateTime: 1,
  q: 1,
  a: 1,
  imageId: 1,
  imageDescMap: 1,
  chunkIndex: 1,
  indexes: 1
};

/**
 * collection 只需要来源展示字段。
 * 文件内容、权限等重字段不在召回阶段读取，减少搜索路径的 Mongo 负担。
 */
export const datasetCollectionSelectField = {
  _id: 1,
  name: 1,
  fileId: 1,
  rawLink: 1,
  apiFileId: 1,
  externalFileId: 1,
  externalFileUrl: 1
};
