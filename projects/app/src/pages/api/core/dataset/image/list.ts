import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { authTeamMember } from '@fastgpt/service/support/permission/auth';
import {
  getDatasetImagesByCollectionId,
  getDatasetImagesByDocId
} from '@fastgpt/service/core/dataset/image/controller';
import { checkDatasetAuthPermission } from '@fastgpt/service/support/permission/dataset/controller';
import { PermissionTypeEnum } from '@fastgpt/global/support/permission/constant';
import { DatasetImageItemType } from '@fastgpt/global/core/dataset/image/type';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { method } = req;

  if (method === 'GET') {
    await connectToDatabase();

    try {
      const { teamId, datasetId, collectionId, relatedDocId, limit } = req.query as {
        teamId: string;
        datasetId: string;
        collectionId?: string;
        relatedDocId?: string;
        limit?: string;
      };

      if (!teamId || !datasetId || (!collectionId && !relatedDocId)) {
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

      let images: Omit<DatasetImageItemType, 'url'>[] = [];

      if (relatedDocId) {
        images = await getDatasetImagesByDocId({
          teamId,
          relatedDocId,
          limit: limit ? parseInt(limit) : undefined
        });
      } else if (collectionId) {
        images = await getDatasetImagesByCollectionId({
          teamId,
          datasetId,
          collectionId,
          limit: limit ? parseInt(limit) : undefined
        });
      }

      const baseUrl = `${process.env.NEXT_PUBLIC_API_PREFIX || ''}/api/core/dataset/image/get`;
      const imagesWithUrl = images.map((image) => ({
        ...image,
        url: `${baseUrl}?id=${image._id}&teamId=${teamId}&datasetId=${datasetId}`
      }));

      return jsonRes(res, {
        data: imagesWithUrl
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
