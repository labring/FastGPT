import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoEvalMetric } from '@fastgpt/service/core/evaluation/metric/schema';
import { parsePaginationRequest } from '@fastgpt/service/common/api/pagination';
import { replaceRegChars } from '@fastgpt/global/common/string/tools';
import { Types } from '@fastgpt/service/common/mongo';
import { addSourceMember } from '@fastgpt/service/support/user/utils';

import type { ListMetricsBody } from '@fastgpt/global/core/evaluation/metric/api';

async function handler(req: ApiRequestProps<ListMetricsBody, {}>) {
  const { teamId, tmbId } = await authUserPer({
    req,
    authToken: true,
    authApiKey: true,
    per: ReadPermissionVal
  });

  const { offset, pageSize } = parsePaginationRequest(req);
  const { searchKey } = req.body;

  const match: Record<string, any> = {
    teamId: new Types.ObjectId(teamId)
  };

  if (searchKey && typeof searchKey === 'string' && searchKey.trim().length > 0) {
    match.name = { $regex: new RegExp(`${replaceRegChars(searchKey.trim())}`, 'i') };
  }

  try {
    const [metrics, total] = await Promise.all([
      MongoEvalMetric.find(match).sort({ createTime: -1 }).skip(offset).limit(pageSize).lean(),
      MongoEvalMetric.countDocuments(match)
    ]);

    const listWithSourceMember = await addSourceMember({
      list: metrics.map((item: any) => ({
        _id: String(item._id),
        name: item.name,
        description: item.description || '',
        createTime: item.createTime,
        updateTime: item.updateTime,
        tmbId: item.tmbId
      }))
    });

    return {
      total,
      list: listWithSourceMember
    };
  } catch (error) {
    return Promise.reject('Failed to fetch evaluation metrics');
  }
}

export default NextAPI(handler);

export { handler };
