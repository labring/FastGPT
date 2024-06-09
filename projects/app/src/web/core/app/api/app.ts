import { DELETE, GET, POST } from '@/web/common/api/request';
import type { CreateAppFolderBody } from '@/pages/api/core/app/folder/create';
import {
  GetResourceFolderListItemResponse,
  GetResourceFolderListProps,
  ParentTreePathItemType
} from '@fastgpt/global/common/parentFolder/type';
import { ParentIdType } from '@fastgpt/global/common/parentFolder/type';

/* folder */
export const postCreateAppFolder = (data: CreateAppFolderBody) =>
  POST('/core/app/folder/create', data);

export const getAppFolderPath = (parentId: ParentIdType) =>
  GET<ParentTreePathItemType[]>(`/core/app/folder/path`, { parentId });

export const getAppFolderList = (data: GetResourceFolderListProps) =>
  GET<GetResourceFolderListItemResponse[]>(`/core/app/folder/list`, data);
