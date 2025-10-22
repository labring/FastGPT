import { MongoApp } from '@fastgpt/service/core/app/schema';
import type { SystemPluginListItemType } from '@fastgpt/global/core/app/type';
import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { replaceRegChars } from '@fastgpt/global/common/string/tools';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { isValidObjectId } from 'mongoose';

export type ListAppBody = {
  searchKey?: string;
};

/**
 * 获取所有用户的插件，用于插件配置时选择
 */
async function handler(req: ApiRequestProps<ListAppBody>): Promise<SystemPluginListItemType[]> {
  const { searchKey } = req.body;

  const res = await authCert({ req, authToken: true });
  if (!res.isRoot) return Promise.reject('error: not root');

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
      ...{ type: AppTypeEnum.plugin },
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
