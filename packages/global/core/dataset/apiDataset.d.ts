export type APIFileItem = {
  id: string;
  parentId: string | null;
  name: string;
  type: 'file' | 'folder';
  updateTime: Date;
  createTime: Date;
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

export type feishuServer = {
  appId: string;
  appSecret: string;
  folderToken: string;
};

export type feishuFileListResponse = {
  files: {
    token: string;
    parent_token: string;
    name: string;
    type: string;
    modified_time: number;
    created_time: number;
    url: string;
    owner_id: string;
  }[];
  has_more: boolean;
  next_page_token: string;
};

export type yuqueServer = {
  userId: string;
  token: string;
};

export type yuqueRepoListResponse = {
  id: string;
  name: string;
  title: string;
  book_id: string | null;
  type: string;
  updated_at: Date;
  created_at: Date;
}[];

export type yuqueTocListResponse = {
  uuid: string;
  type: string;
  title: string;
  url: string;
  slug: string;
  id: string;
  doc_id: string;
  prev_uuid: string;
  sibling_uuid: string;
  child_uuid: string;
  parent_uuid: string;
}[];
