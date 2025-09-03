import { type ImportSourceItemType } from '@/web/core/dataset/type';
import { DatasetSourceReadTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { i18nT } from '@fastgpt/web/i18n/utils';

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

export const databaseAddrValidator = (val: string) => {
  const forbiddenPatterns = [
    /^127(\.\d+){0,3}$/, // 匹配127、127.x、127.x.x、127.x.x.x
    /^localhost$/i, // localhost
    /^0\.0\.0\.0$/ // 0.0.0.0
  ];
  if (forbiddenPatterns.some((pattern) => pattern.test(val))) {
    return i18nT('dataset:validate_ip_tip');
  }

  return true;
};
