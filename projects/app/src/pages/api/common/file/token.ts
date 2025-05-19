import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { NextAPI } from '@/service/middleware/entry';
import { createFileToken } from '@fastgpt/service/support/permission/controller';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';

async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    const { bucketName, fileId, teamId, datasetId } = req.body;

    if (!bucketName || !fileId) {
      return jsonRes(res, {
        code: 400,
        error: 'Missing bucketName or fileId'
      });
    }

    let finalTeamId = teamId;
    let uid = '';

    if (bucketName === 'dataset') {
      if (datasetId) {
        try {
          const authData = await authDataset({
            datasetId,
            per: ReadPermissionVal,
            req,
            authToken: true,
            authApiKey: true
          });

          finalTeamId = authData.teamId;
          uid = authData.tmbId;
        } catch (error) {
          console.error('验证数据集权限失败:', error);

          uid = (req as any).user?.tmbId || '';
        }
      } else {
        uid = (req as any).user?.tmbId || '';
      }
    } else {
      uid = (req as any).user?.uid || (req as any).user?.tmbId || '';
    }

    if (!finalTeamId || !uid) {
      console.log('缺少必要参数:', {
        finalTeamId,
        uid,
        teamId,
        originalUid: (req as any).user?.tmbId
      });

      finalTeamId = finalTeamId || (req as any).user?.teamId || '';
      uid = uid || (req as any).user?.tmbId || '';
    }

    console.log('创建文件token参数:', { bucketName, teamId: finalTeamId, uid, fileId });

    const token = await createFileToken({
      bucketName,
      teamId: finalTeamId,
      uid,
      fileId
    });

    jsonRes(res, {
      data: token
    });
  } catch (error) {
    console.error('生成文件token失败:', error);
    jsonRes(res, {
      code: 500,
      error
    });
  }
}

export default NextAPI(handler);
