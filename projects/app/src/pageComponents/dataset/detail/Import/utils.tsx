import { ImportSourceItemType } from '@/web/core/dataset/type';
import { DatasetSourceReadTypeEnum } from '@fastgpt/global/core/dataset/constants';

export const getPreviewSourceReadType = (previewSource: ImportSourceItemType) => {
  if (previewSource.dbFileId) {
    return DatasetSourceReadTypeEnum.fileLocal;
  }
  if (previewSource.link) {
    return DatasetSourceReadTypeEnum.link;
  }
  if (previewSource.apiFileId) {
    return DatasetSourceReadTypeEnum.apiFile;
  }
  if (previewSource.externalFileId) {
    return DatasetSourceReadTypeEnum.externalFile;
  }

  return DatasetSourceReadTypeEnum.fileLocal;
};

export default function Dom() {
  return <></>;
}
