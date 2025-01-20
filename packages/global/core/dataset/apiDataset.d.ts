export type APIFileItem = {
  id: string;
  parentId: string | null;
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

export type APIFileContentResponse = {
  content?: string;
  previewUrl?: string;
};

export type APIFileReadResponse = {
  url: string;
};

export type FeishuServer = {
  appId: string;
  appSecret: string;
  folderToken: string;
};

export type YuqueServer = {
  userId: string;
  token: string;
};
