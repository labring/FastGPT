import { ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import { FeishuServer, YuqueServer } from '@fastgpt/global/core/dataset/apiDataset';

export enum ProApiDatasetOperationTypeEnum {
  LIST = 'list',
  READ = 'read',
  CONTENT = 'content'
}

export type ProApiDatasetCommonParams = {
  feishuServer?: FeishuServer;
  yuqueServer?: YuqueServer;
};

export type GetProApiDatasetFileListParams = ProApiDatasetCommonParams & {
  parentId?: ParentIdType;
};

export type GetProApiDatasetFileContentParams = ProApiDatasetCommonParams & {
  apiFileId: string;
};

export type GetProApiDatasetFilePreviewUrlParams = ProApiDatasetCommonParams & {
  apiFileId: string;
};
