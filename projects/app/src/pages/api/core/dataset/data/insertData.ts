import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase } from '@/service/mongo';
import { authKb, authUser } from '@/service/utils/auth';
import { withNextCors } from '@/service/utils/tools';
import { PgDatasetTableName } from '@/constants/plugin';
import { insertData2Dataset, PgClient } from '@/service/pg';
import { getVectorModel } from '@/service/utils/data';
import { getVector } from '@/pages/api/openapi/plugin/vector';
import { DatasetDataItemType } from '@/types/core/dataset/data';
import { countPromptTokens } from '@/utils/common/tiktoken';

export type Props = {
  billId?: string;
  kbId: string;
  data: DatasetDataItemType;
};

export default withNextCors(async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();

    // 凭证校验
    const { userId } = await authUser({ req, authToken: true });

    jsonRes(res, {
      data: await getVectorAndInsertDataset({
        ...req.body,
        userId
      })
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
});

export async function getVectorAndInsertDataset(
  props: Props & { userId: string }
): Promise<string> {
  const { kbId, data, userId, billId } = props;
  if (!kbId || !data?.q) {
    return Promise.reject('缺少参数');
  }

  // auth kb
  const kb = await authKb({ kbId, userId });

  const q = data?.q?.replace(/\\n/g, '\n').trim().replace(/'/g, '"');
  const a = data?.a?.replace(/\\n/g, '\n').trim().replace(/'/g, '"');

  // token check
  const token = countPromptTokens(q, 'system');

  if (token > getVectorModel(kb.vectorModel).maxToken) {
    return Promise.reject('Over Tokens');
  }

  const { rows: existsRows } = await PgClient.query(`
  SELECT COUNT(*) > 0 AS exists
  FROM  ${PgDatasetTableName} 
  WHERE md5(q)=md5('${q}') AND md5(a)=md5('${a}') AND user_id='${userId}' AND kb_id='${kbId}'
`);
  const exists = existsRows[0]?.exists || false;

  if (exists) {
    return Promise.reject('已经存在完全一致的数据');
  }

  const { vectors } = await getVector({
    model: kb.vectorModel,
    input: [q],
    userId,
    billId
  });

  const response = await insertData2Dataset({
    userId,
    kbId,
    data: [
      {
        ...data,
        q,
        a,
        vector: vectors[0]
      }
    ]
  });

  // @ts-ignore
  return response?.rows?.[0]?.id || '';
}
