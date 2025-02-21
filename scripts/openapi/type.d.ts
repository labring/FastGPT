export type ApiMetaData = {
  name?: string;
  author?: string;
  version?: string;
};

export type ApiType = {
  description?: string;
  authorization?: 'apikey' | 'token';
  path: string;
  url: string;
  query?: itemType | itemType[];
  body?: itemType | itemType[];
  response?: itemType | itemType[];
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
} & ApiMetaData;

export type itemType = {
  comment?: string;
  key?: string;
  type: string;
  required?: boolean;
};
