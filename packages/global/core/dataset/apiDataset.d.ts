import { RequireOnlyOne } from '../../common/type/utils';
import type { ParentIdType } from '../../common/parentFolder/type.d';

export type APIFileItem = {
  id: string;
  parentId: ParentIdType;
  name: string;
  type: 'file' | 'folder';
  updateTime: Date;
  createTime: Date;
  hasChild?: boolean;
};

export type APIFileServer = {
  baseUrl: string;
  authorization: string;
};

export type APIFileListResponse = APIFileItem[];

export type ApiFileReadContentResponse = {
  title?: string;
  rawText: string;
};

export type APIFileReadResponse = {
  url: string;
};

export type ApiDatasetDetailResponse = {
  id: string;
  name: string;
  parentId: ParentIdType;
};

export type FeishuServer = {
  appId: string;
  appSecret: string;
  folderToken: string;
  // baseUrl: string | undefined;
};

export type YuqueServer = {
  userId: string;
  token: string;
  baseUrl: string | undefined;
};
