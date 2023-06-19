import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, Collection, Model } from '@/service/mongo';
import { authUser } from '@/service/utils/auth';
import type { ModelListResponse } from '@/api/response/model';

/* 获取模型列表 */
export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    // 凭证校验
    const { userId } = await authUser({ req, authToken: true });

    await connectToDatabase();

    // 根据 userId 获取模型信息
    const [myModels, myCollections] = await Promise.all([
      Model.find(
        {
          userId
        },
        '_id avatar name intro'
      ).sort({
        updateTime: -1
      }),
      Collection.find({ userId })
        .populate({
          path: 'modelId',
          select: '_id avatar name intro',
          match: { 'share.isShare': true }
        })
        .then((res) => res.filter((item) => item.modelId))
    ]);

    jsonRes<ModelListResponse>(res, {
      data: {
        myModels: myModels.map((item) => ({
          _id: item._id,
          name: item.name,
          avatar: item.avatar,
          intro: item.intro
        })),
        myCollectionModels: myCollections
          .map((item: any) => ({
            _id: item.modelId?._id,
            name: item.modelId?.name,
            avatar: item.modelId?.avatar,
            intro: item.modelId?.intro
          }))
          .filter((item) => !myModels.find((model) => String(model._id) === String(item._id))) // 去重
      }
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
