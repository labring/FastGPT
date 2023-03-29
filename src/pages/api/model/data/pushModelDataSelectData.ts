import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, DataItem, ModelData } from '@/service/mongo';
import { authToken } from '@/service/utils/tools';
import { customAlphabet } from 'nanoid';
const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz1234567890', 12);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    let { dataIds, modelId } = req.body as { dataIds: string[]; modelId: string };

    if (!dataIds) {
      throw new Error('参数错误');
    }
    await connectToDatabase();

    const { authorization } = req.headers;

    const userId = await authToken(authorization);

    const dataItems = (
      await Promise.all(
        dataIds.map((dataId) =>
          DataItem.find<{ _id: string; result: { q: string }[]; text: string }>(
            {
              userId,
              dataId
            },
            'result text'
          )
        )
      )
    ).flat();

    // push data
    await ModelData.insertMany(
      dataItems.map((item) => ({
        modelId: modelId,
        userId,
        text: item.text,
        q: item.result.map((item) => ({
          id: nanoid(),
          text: item.q
        }))
      }))
    );

    jsonRes(res, {
      data: dataItems
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
