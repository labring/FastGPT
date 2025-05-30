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

// Api dataset config
export type APIFileServer = {
  baseUrl: string;
  authorization?: string;
  basePath?: string;
};
export type FeishuShareServer = {
  user_access_token: string;
  refresh_token: string;
  outdate_time: number;
  folderToken: string;
};
export type FeishuKnowledgeServer = {
  user_access_token: string;
  refresh_token: string;
  outdate_time: number;
  basePath?: string;
};

export type FeishuPrivateServer = {
  user_access_token: string;
  refresh_token: string;
  outdate_time: number;
  basePath?: string;
};

export type YuqueServer = {
  userId: string;
  token?: string;
  basePath?: string;
};

// Api dataset api

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
