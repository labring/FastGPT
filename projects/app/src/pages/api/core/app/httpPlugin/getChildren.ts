import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import type { HttpToolConfigType } from '@fastgpt/global/core/app/type';
import { UserError } from '@fastgpt/global/common/error/utils';
import { getHTTPChildren } from '@fastgpt/service/core/app/http';
import { replaceRegChars } from '@fastgpt/global/common/string/tools';

export type HttpGetChildrenQuery = {
  id: string;
  searchKey?: string;
};
export type HttpGetChildrenBody = {};
export type HttpGetChildrenResponse = (HttpToolConfigType & {
  id: string;
  avatar: string;
})[];

async function handler(
  req: ApiRequestProps<HttpGetChildrenBody, HttpGetChildrenQuery>,
  _res: ApiResponseType<any>
): Promise<HttpGetChildrenResponse> {
  const { id, searchKey } = req.query;

  const app = await MongoApp.findOne({ _id: id }).lean();
  if (!app) return Promise.reject(new UserError('No Http Toolset found'));

  if (app.type !== AppTypeEnum.httpToolSet && app.type !== AppTypeEnum.httpPlugin) {
    return Promise.reject(new UserError('the parent is not a http toolset'));
  }

  const list = await getHTTPChildren(app);
  return list.filter((item) => {
    if (searchKey && searchKey.trim() !== '') {
      const regx = new RegExp(replaceRegChars(searchKey.trim()), 'i');
      return regx.test(item.name);
    }
    return true;
  });
}

export default NextAPI(handler);
