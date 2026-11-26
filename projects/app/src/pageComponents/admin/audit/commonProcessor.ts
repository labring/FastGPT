export type CommonMetadataFields = {
  appType?: string;
  datasetType?: string;
  operationName?: string;
  itemName?: string;
  newItemNames?: string[] | string;
  [key: string]: any;
};

/** Translate only system i18n keys; preserve arbitrary user/plugin names containing colons. */
export const defaultMetadataProcessor = (metadata: CommonMetadataFields = {}, t: any): any => {
  const result = { ...metadata };

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
