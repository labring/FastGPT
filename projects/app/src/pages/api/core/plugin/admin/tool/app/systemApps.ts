import { MongoApp } from '@fastgpt/service/core/app/schema';
import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { replaceRegChars } from '@fastgpt/global/common/string/tools';
import { isValidObjectId } from 'mongoose';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import type {
  GetAllSystemAppsBodyType,
  GetAllSystemAppTypeToolsResponse
} from '@fastgpt/global/openapi/core/plugin/admin/tool/api';

export type ListAppBody = GetAllSystemAppsBodyType;

/**
 * 获取所有用户的插件，用于插件配置时选择
 */
async function handler(
  req: ApiRequestProps<ListAppBody>
): Promise<GetAllSystemAppTypeToolsResponse> {
  const { searchKey } = req.body;
  await authSystemAdmin({ req });

  const findAppsQuery = (() => {
    const searchMatch = searchKey
      ? {
          $or: [
            { name: { $regex: new RegExp(`${replaceRegChars(searchKey)}`, 'i') } },
            { intro: { $regex: new RegExp(`${replaceRegChars(searchKey)}`, 'i') } },
            ...(isValidObjectId(searchKey) ? [{ _id: searchKey }] : [])
          ]
        }
      : {};

    return {
      ...{ type: AppTypeEnum.workflowTool },
      ...searchMatch
    };
  })();

  const plugins = await MongoApp.find(findAppsQuery, '_id avatar name')
    .sort({
      updateTime: -1
    })
    .limit(searchKey ? 20 : 100)
    .lean();

  return plugins.map((plugin) => ({
    _id: plugin._id,
    avatar: plugin.avatar,
    name: plugin.name
  }));
}

export default NextAPI(handler);
