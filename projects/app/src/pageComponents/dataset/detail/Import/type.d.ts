import { ImportSourceItemType } from '@/web/core/dataset/type';

export type UploadFileItemType = ImportSourceItemType & {
  file?: File;
  isUploading: boolean;
  uploadedFileRate: number;
};
