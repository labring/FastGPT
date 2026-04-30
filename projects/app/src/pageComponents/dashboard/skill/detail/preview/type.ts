import type { ChatFileTypeEnum } from '@fastgpt/global/core/chat/constants';

export type UserInputFileItemType = {
  id: string;
  rawFile?: File;
  type: `${ChatFileTypeEnum}`;
  name: string;
  icon: string;
  status: 0 | 1; // 0: uploading, 1: success
  url?: string;
  key?: string;
  process?: number;
  error?: string;
};

export type PreviewInputFormType = {
  input: string;
  files: UserInputFileItemType[];
};
