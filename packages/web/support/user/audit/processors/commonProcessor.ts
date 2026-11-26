export type CommonMetadataFields = {
  appType?: string;
  datasetType?: string;
  operationName?: string;
  itemName?: string;
  newItemNames?: string[] | string;
  [key: string]: any;
};

/** 只翻译实际存在的系统 key；名称、URL 和配置值保持原文。 */
export const defaultMetadataProcessor = (metadata: CommonMetadataFields, t: any): any => {
  const result = { ...metadata };

  // 这些字段由审计写入方提供系统标签；用户名称、路径、URL、变更值不能按 key 翻译。
  const labelFields = new Set([
    'appType',
    'datasetType',
    'skillType',
    'operationName',
    'itemName',
    'objectName',
    'level'
  ]);
  Object.entries(metadata).forEach(([key, value]) => {
    if (labelFields.has(key) && typeof value === 'string' && value.includes(':')) {
      result[key] = t(value, { defaultValue: value });
    }
  });

  if (metadata.newItemNames) {
    if (Array.isArray(metadata.newItemNames)) {
      result.newItemNames = metadata.newItemNames
        .map((itemName: string) => t(itemName as any))
        .join(',');
    } else if (typeof metadata.newItemNames === 'string') {
      result.newItemNames = metadata.newItemNames
        .split(',')
        .map((itemName: string) => t(itemName as any))
        .join(',');
    }
  }

  return result;
};
