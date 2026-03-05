import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { listSkills } from '@fastgpt/service/core/agentSkills/controller';
import type { ListSkillsQuery, ListSkillsResponse } from '@fastgpt/global/core/agentSkills/api';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Get query parameters
    const {
      source = 'store',
      searchKey,
      category,
      page = '1',
      pageSize = '20'
    } = req.query as unknown as ListSkillsQuery;

    // Authenticate user
    const { teamId, tmbId } = await authUserPer({
      req,
      authToken: true,
      authApiKey: true
    });

    // Parse pagination
    const pageNum = Math.max(1, parseInt(page as string, 10));
    const pageSizeNum = Math.min(100, Math.max(1, parseInt(pageSize as string, 10)));

    // List skills
    const { list, total } = await listSkills({
      source,
      teamId,
      searchKey,
      category,
      page: pageNum,
      pageSize: pageSizeNum
    });

    // Format response
    const formattedList = list.map((skill) => ({
      ...skill,
      createTime: skill.createTime?.toISOString() || new Date().toISOString(),
      updateTime: skill.updateTime?.toISOString() || new Date().toISOString()
    }));

    jsonRes<ListSkillsResponse>(res, {
      data: {
        list: formattedList,
        total
      }
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
