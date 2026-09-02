import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { UserError } from '@fastgpt/global/common/error/utils';
import { getHTTPToolList } from '@fastgpt/service/core/app/http';
import { replaceRegChars } from '@fastgpt/global/common/string/tools';
import {
  GetHttpChildrenQuerySchema,
  GetHttpChildrenResponseSchema,
  type GetHttpChildrenQueryType,
  type GetHttpChildrenResponseType
} from '@fastgpt/global/openapi/core/app/httpTools/api';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';

async function handler(
  req: ApiRequestProps<Record<string, never>, GetHttpChildrenQueryType>
): Promise<GetHttpChildrenResponseType> {
  const {
    query: { id, searchKey }
  } = parseApiInput({
    req,
    querySchema: GetHttpChildrenQuerySchema
  });

  const { app } = await authApp({ req, authToken: true, appId: id, per: ReadPermissionVal });

  if (app.type !== AppTypeEnum.httpToolSet) {
    return Promise.reject(new UserError('the parent is not an http toolset'));
  }

  const toolList = (await getHTTPToolList(app)).filter((item) => {
    if (searchKey && searchKey.trim() !== '') {
      const regex = new RegExp(replaceRegChars(searchKey.trim()), 'i');
      return regex.test(item.name);
    }
    return true;
  });

  return GetHttpChildrenResponseSchema.parse(
    toolList.map(({ id, avatar, name, description }) => ({ id, avatar, name, description }))
  );
}

export default NextAPI(handler);
