import { KbTypeEnum } from '@/constants/kb';
import type { RequestPaging } from '@/types';

export type KbUpdateParams = {
  id: string;
  tags?: string;
  name?: string;
  avatar?: string;
};
export type CreateKbParams = {
  parentId?: string;
  name: string;
  tags: string[];
  avatar: string;
  vectorModel?: string;
  type: `${KbTypeEnum}`;
};

export type GetKbDataListProps = RequestPaging & {
  kbId: string;
  searchText: string;
  fileId: string;
};
