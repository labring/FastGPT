import { DatasetSourceReadTypeEnum, ImportDataSourceEnum } from './constants';

export const importType2ReadType = (type: ImportDataSourceEnum) => {
  if (type === ImportDataSourceEnum.csvTable || type === ImportDataSourceEnum.fileLocal) {
    return DatasetSourceReadTypeEnum.fileLocal;
  }
  if (type === ImportDataSourceEnum.fileLink) {
    return DatasetSourceReadTypeEnum.link;
  }
  if (type === ImportDataSourceEnum.externalFile) {
    return DatasetSourceReadTypeEnum.externalFile;
  }
  return DatasetSourceReadTypeEnum.link;
};
