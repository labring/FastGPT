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

  const translatableFields = ['appType', 'datasetType', 'operationName', 'itemName'];

  Object.entries(metadata)
    .filter(([key, value]) => translatableFields.includes(key) && value)
    .forEach(([key, value]) => {
      result[key] = t(value as any);
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

export const createSpecialProcessor = (specificProcessor: (metadata: any) => any) => {
  return (metadata: any, t: any) => {
    let processedMetadata = defaultMetadataProcessor(metadata, t);
    processedMetadata = specificProcessor(processedMetadata);
    return processedMetadata;
  };
};
