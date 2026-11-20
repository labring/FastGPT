import type { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import type { ChunkSettingModeEnum } from '@fastgpt/global/core/dataset/constants';
import type { UseFormReturn } from 'react-hook-form';
import type { APIFileItemType } from '@fastgpt/global/core/dataset/apiDataset/type';

export type ImportSourceItemType = {
  id: string;

  createStatus: 'waiting' | 'creating' | 'finish';
  metadata?: Record<string, any>;
  errorMsg?: string;

  // source
  sourceName: string;
  icon: string;

  // file
  sourceSize?: string;
  isUploading?: boolean;
  uploadedFileRate?: number;
  dbFileId?: string; // 存储在数据库里的文件Id

  file?: File; // Local file

  // link
  link?: string;

  // custom text
  rawText?: string;

  // external file
  externalFileUrl?: string;
  externalFileId?: string;

  // api dataset
  apiFileId?: string;
  apiFile?: APIFileItemType;
  /** 从远端根到该节点直接父级的祖先 ID 链，用于服务端校验并补建 syncChildren=false 祖先目录 */
  ancestorIds?: string[];
  /** 用于 UI 展示的祖先路径文本 */
  ancestorPathLabel?: string;
  /** 是否为重新勾选恢复自动同步（syncChildren: false -> true）的已有目录 */
  isReEnableSync?: boolean;
  /** 是否为根级全库同步（syncAll: true）汇总条目 */
  isSyncAllSummary?: boolean;
};

export type ImportSourceParamsType = UseFormReturn<
  {
    chunkSize: number;
    chunkOverlapRatio: number;
    chunkSplitter: string;
    prompt: string;
    mode: TrainingModeEnum;
    way: ChunkSettingModeEnum;
  },
  any
>;
