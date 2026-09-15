export interface CommonMetadataFields {
  appType?: string;
  datasetType?: string;
  operationName?: string;
  itemName?: string;
  newItemNames?: string[] | string;
  [key: string]: any;
}

export const defaultMetadataProcessor = (metadata: CommonMetadataFields, t: any): any => {
  const result = { ...metadata };

  Object.entries(metadata).forEach(([key, value]) => {
    if (typeof value === 'string' && value.includes(':')) {
      result[key] = t(value as any);
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
