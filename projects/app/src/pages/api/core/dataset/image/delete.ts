import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { authTeamMember } from '@fastgpt/service/support/permission/auth';
import { deleteDatasetImageById } from '@fastgpt/service/core/dataset/image/controller';
import { checkDatasetAuthPermission } from '@fastgpt/service/support/permission/dataset/controller';
import { PermissionTypeEnum } from '@fastgpt/global/support/permission/constant';
import { getDatasetImageById } from '@fastgpt/service/core/dataset/image/controller';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { method } = req;

  if (method === 'POST') {
    await connectToDatabase();

    try {
      const { teamId, datasetId, imageId } = req.body as {
        teamId: string;
        datasetId: string;
        imageId: string;
      };

      if (!teamId || !datasetId || !imageId) {
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
        minPermission: PermissionTypeEnum.edit
      });

      const image = await getDatasetImageById(imageId);
      if (!image) {
        return jsonRes(res, {
          code: 404,
          message: '图片不存在'
        });
      }

      if (image.teamId.toString() !== teamId || image.datasetId.toString() !== datasetId) {
        return jsonRes(res, {
          code: 403,
          message: '无权操作该图片'
        });
      }

      await deleteDatasetImageById(imageId);

      return jsonRes(res, {
        data: 'success'
      });
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
