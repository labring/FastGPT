import { FileStatusEnum } from '@/constants/dataset';

export type DatasetFileItemType = {
  id: string;
  size: number;
  filename: string;
  uploadTime: Date;
  chunkLength: number;
  status: `${FileStatusEnum}`;
};
