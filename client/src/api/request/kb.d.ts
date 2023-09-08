import { KbTypeEnum } from '@/constants/kb';
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
