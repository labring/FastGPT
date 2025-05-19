import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { authTeamMember } from '@fastgpt/service/support/permission/auth';
import formidable from 'formidable';
import { readFileSync } from 'fs';
import { createDatasetImage } from '@fastgpt/service/core/dataset/image/controller';
import { getTeamMember } from '@fastgpt/service/support/user/team/controller';
import { checkDatasetAuthPermission } from '@fastgpt/service/support/permission/dataset/controller';
import { PermissionTypeEnum } from '@fastgpt/global/support/permission/constant';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';

export const config = {
  api: {
    bodyParser: false
  }
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { method } = req;

  if (method === 'POST') {
    await connectToDatabase();

    try {
      const form = formidable();
      const [fields, files] = await form.parse(req);

      const { teamId, datasetId, relatedDocId, collectionId } = fields;

      if (!teamId?.[0] || !datasetId?.[0]) {
        return jsonRes(res, {
          code: 400,
          message: '缺少必要参数'
        });
      }

      const team = await authTeamMember({
        teamId: teamId[0],
        req,
        authApi: true
      });

      const dataset = await MongoDataset.findById(datasetId[0]);
      if (!dataset) {
        return jsonRes(res, {
          code: 404,
          message: '数据集不存在'
        });
      }

      await checkDatasetAuthPermission({
        datasetId: datasetId[0],
        teamId: teamId[0],
        userId: team.user._id,
        tmbId: team._id,
        minPermission: PermissionTypeEnum.edit
      });

      const tmbId = team._id;

      if (!files.file?.[0]) {
        return jsonRes(res, {
          code: 400,
          message: '请上传图片'
        });
      }

      const file = files.file[0];

      if (!file.mimetype?.includes('image/')) {
        return jsonRes(res, {
          code: 400,
          message: '仅支持上传图片文件'
        });
      }

      const binary = readFileSync(file.filepath);

      const { _id } = await createDatasetImage({
        teamId: teamId[0],
        tmbId,
        datasetId: datasetId[0],
        collectionId: collectionId?.[0],
        binary,
        metadata: {
          mime: file.mimetype,
          filename: file.originalFilename,
          relatedDocId: relatedDocId?.[0],
          sourceType: 'import'
        }
      });

      return jsonRes(res, {
        data: { _id }
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
