import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { authTeamMember } from '@fastgpt/service/support/permission/auth';
import { getDatasetImageById } from '@fastgpt/service/core/dataset/image/controller';
import { checkDatasetAuthPermission } from '@fastgpt/service/support/permission/dataset/controller';
import { PermissionTypeEnum } from '@fastgpt/global/support/permission/constant';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { method } = req;

  if (method === 'GET') {
    await connectToDatabase();

    try {
      const { id, teamId, datasetId } = req.query as {
        id: string;
        teamId: string;
        datasetId: string;
      };

      if (!id || !teamId || !datasetId) {
        return jsonRes(res, {
          code: 400,
          message: '缺少必要参数'
        });
      }

      const team = await authTeamMember({
        teamId,
        req,
        authApi: true
      });

      await checkDatasetAuthPermission({
        datasetId,
        teamId,
        userId: team.user._id,
        tmbId: team._id,
        minPermission: PermissionTypeEnum.read
      });

      const image = await getDatasetImageById(id);

      if (!image) {
        return jsonRes(res, {
          code: 404,
          message: '图片不存在'
        });
      }

      if (image.teamId.toString() !== teamId) {
        return jsonRes(res, {
          code: 403,
          message: '无权访问该图片'
        });
      }

      if (image.datasetId.toString() !== datasetId) {
        return jsonRes(res, {
          code: 403,
          message: '无权访问该图片'
        });
      }

      res.setHeader('Content-Type', image.metadata?.mime || 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=31536000');

      res.send(image.binary);
    } catch (error) {
      return jsonRes(res, {
        code: 500,
        error
      });
    }
  }

  return jsonRes(res, {
    code: 405,
    message: 'Method not allowed'
  });
}
