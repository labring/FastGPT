/* 
    Get folder list by parentId
*/
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import {
  GetResourceFolderListItemResponse,
  GetResourceFolderListProps
} from '@fastgpt/global/common/parentFolder/type';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { parseParentIdInMongo } from '@fastgpt/global/common/parentFolder/utils';

export type listResponse = {};

async function handler(
  req: ApiRequestProps<{}, GetResourceFolderListProps>,
  res: ApiResponseType<any>
): Promise<GetResourceFolderListItemResponse[]> {
  const { parentId = null } = req.query;

  const list = await MongoApp.find(
    {
      type: AppTypeEnum.folder,
      ...parseParentIdInMongo(parentId)
    },
    'name'
  );

  return list.map((item) => ({
    id: item._id,
    name: item.name
  }));
}

export default NextAPI(handler);
