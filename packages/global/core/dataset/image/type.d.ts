export type DatasetImageSchemaType = {
  _id: string;
  teamId: string;
  tmbId: string;
  datasetId: string;
  collectionId?: string; // 可选关联，如果是知识库内的图片可以关联
  binary: Buffer;

  // 图片元数据
  metadata?: {
    mime?: string; // 图片MIME类型
    filename?: string; // 原始文件名
    width?: number; // 图片宽度
    height?: number; // 图片高度
    relatedDocId?: string; // 关联的文档ID
    sourceType?: 'document' | 'import' | 'other'; // 图片来源类型
  };

  createTime: Date;
  updateTime: Date;
  expiredTime?: Date; // 可选的过期时间，用于临时图片
};

// 前端API返回的图片信息，不包含二进制数据
export type DatasetImageItemType = Omit<DatasetImageSchemaType, 'binary'> & {
  url: string; // 访问图片的URL
};
