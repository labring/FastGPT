import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase } from '@/service/mongo';
import { authUser } from '@fastgpt/support/user/auth';
import { GridFSStorage } from '@/service/lib/gridfs';
import { UpdateFileProps } from '@/global/core/api/datasetReq.d';
import { Types } from '@fastgpt/common/mongo';
import { PgClient } from '@/service/pg';
import { PgDatasetTableName } from '@/constants/plugin';
import { addLog } from '@/service/utils/tools';
import { strIsLink } from '@fastgpt/common/tools/str';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();

    const { id, name, datasetUsed } = req.body as UpdateFileProps;
    const { userId } = await authUser({ req, authToken: true });

    const gridFs = new GridFSStorage('dataset', userId);
    const collection = gridFs.Collection();

    if (id.length === 24 && !strIsLink(id)) {
      await collection.findOneAndUpdate(
        {
          _id: new Types.ObjectId(id)
        },
        {
          $set: {
            ...(name && { filename: name }),
            ...(datasetUsed && { ['metadata.datasetUsed']: datasetUsed })
          }
        }
      );
    }

    // data source
    await updateDatasetSource({
      fileId: id,
      userId,
      name
    });

    jsonRes(res, {});
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
async function updateDatasetSource(data: { fileId: string; userId: string; name?: string }) {
  const { fileId, userId, name } = data;
  if (!fileId || !name || !userId) return;
  try {
    await PgClient.update(PgDatasetTableName, {
      where: [['user_id', userId], 'AND', ['file_id', fileId]],
      values: [
        {
          key: 'source',
          value: name
        }
      ]
    });
  } catch (error) {
    addLog.error(`Update dataset source error`, error);
    setTimeout(() => {
      updateDatasetSource(data);
    }, 2000);
  }
}
