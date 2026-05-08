import type { ChatFileTypeEnum } from '@fastgpt/global/core/chat/constants';

type FileSelectorBaseItemType = {
  id?: string;
  type?: ChatFileTypeEnum;
  name?: string;
  key?: string;
  url?: string;
};

export type FileSelectorValueItemType = {
  type: ChatFileTypeEnum;
  name: string;
} & ({ key: string; url?: never } | { key?: never; url: string });

export type FileSelectorRenderItemType = FileSelectorBaseItemType & {
  id: string;
  rawFile?: File;
  type: ChatFileTypeEnum;
  name: string;
  icon?: string;
  status?: 0 | 1;
  process?: number;
  error?: string;
};

export type FileSelectorInputObjectItemType = FileSelectorBaseItemType & {
  rawFile?: File;
  icon?: string;
  status?: 0 | 1;
  process?: number;
  error?: string;
};

export type FileSelectorInputItemType = string | FileSelectorInputObjectItemType | null | undefined;

export type FileSelectorInputValueType = FileSelectorInputItemType[];
