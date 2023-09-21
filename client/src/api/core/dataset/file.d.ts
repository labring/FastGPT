import { RequestPaging } from '../../../types/index';

export type GetFileListProps = RequestPaging & {
  kbId: string;
  searchText: string;
};

export type UpdateFileProps = { id: string; name?: string; datasetUsed?: boolean };

export type MarkFileUsedProps = { fileIds: string[] };
