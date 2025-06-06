import { RequireOnlyOne } from '../../../common/type/utils';
import type { ParentIdType } from '../../../common/parentFolder/type';

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
export type FeishuServer = {
  appId: string;
  appSecret?: string;
  folderToken: string;
};
export type YuqueServer = {
  userId: string;
  token?: string;
  basePath?: string;
};

export type ApiDatasetServerType = {
  apiServer?: APIFileServer;
  feishuServer?: FeishuServer;
  yuqueServer?: YuqueServer;
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
