import { Types } from '@fastgpt/service/common/mongo';
import { MongoOpenApi } from '@fastgpt/service/support/openapi/schema';
import { resolveApiKeyScope } from '@fastgpt/service/support/openapi/utils';
import { ApiKeyTypeEnum } from '@fastgpt/global/support/openapi/constants';

/**
 * 规范化全部 Key：缺类型时补 personal，有效字符串 appId 转为 BSON ObjectId。
 * 先校验完整类型与绑定，空默认目标保持原状；CAS 同时核对两个源字段，避免覆盖并发修改。
 */
export const backfillOpenApiKeyTypeRecord = async (id: string) => {
  const collection = MongoOpenApi.collection;
  for (let attempt = 0; attempt < 3; attempt++) {
    const raw = await collection.findOne(
      { _id: new Types.ObjectId(id) },
      { projection: { type: 1, appId: 1 } }
    );
    if (!raw) return;
    resolveApiKeyScope({ type: raw.type, appId: raw.appId });
    const fields = {
      ...(raw.type === undefined ? { type: ApiKeyTypeEnum.personal } : {}),
      ...(typeof raw.appId === 'string' && raw.appId !== ''
        ? { appId: new Types.ObjectId(raw.appId) }
        : {})
    };
    if (Object.keys(fields).length === 0) return;

    const updated = await collection.updateOne(
      {
        _id: raw._id,
        type: raw.type === undefined ? { $exists: false } : raw.type,
        appId: raw.appId === undefined ? { $exists: false } : raw.appId
      },
      { $set: fields }
    );
    if (updated.matchedCount) return;
  }
  throw new Error('API Key binding changed repeatedly while backfilling');
};
