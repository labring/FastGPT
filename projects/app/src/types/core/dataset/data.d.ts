export type DatasetDataItemType = {
  q: string; // 提问词
  a: string; // 原文
  source?: string;
  file_id?: string;
};

export type PgDataItemType = DatasetItemType & {
  id: string;
};
