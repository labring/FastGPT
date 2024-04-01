import type { PushDatasetDataChunkProps } from '@fastgpt/global/core/dataset/api';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { ImportProcessWayEnum, ImportSourceTypeEnum } from './constants';
import { UseFormReturn } from 'react-hook-form';

export type ImportDataComponentProps = {
  activeStep: number;
  goToNext: () => void;
};

export type ImportSourceItemType = {
  id: string;

  createStatus: 'waiting' | 'creating' | 'finish';
  metadata?: Record<string, any>;
  errorMsg?: string;

  // source
  sourceName: string;
  sourceSize?: string;
  icon: string;

  // file
  isUploading?: boolean;
  uploadedFileRate?: number;
  dbFileId?: string; // 存储在数据库里的文件Id，这个 ID 还是图片和集合的 metadata 中 relateId
  file?: File;

  // link
  link?: string;

  // custom text
  rawText?: string;
};

export type ImportSourceParamsType = UseFormReturn<
  {
    chunkSize: number;
    chunkOverlapRatio: number;
    customSplitChar: string;
    prompt: string;
    mode: TrainingModeEnum;
    way: ImportProcessWayEnum;
  },
  any
>;
