import { Types } from '@fastgpt/service/common/mongo';
import { MongoOpenApi } from '@fastgpt/service/support/openapi/schema';
import { resolveApiKeyScope } from '@fastgpt/service/support/openapi/utils';

/** 只追加缺失的 type，不改变绑定或凭证；CAS 未命中必须重读，不能把并发变更误记为成功。 */
export const backfillOpenApiKeyTypeRecord = async (id: string) => {
  const collection = MongoOpenApi.collection;
  for (let attempt = 0; attempt < 3; attempt++) {
    const raw = await collection.findOne(
      { _id: new Types.ObjectId(id) },
      { projection: { type: 1, appId: 1 } }
    );
    if (!raw) return;
    const result = resolveApiKeyScope({ type: raw.type, appId: raw.appId });
    if (raw.type !== undefined) return;
    const updated = await collection.updateOne(
      { _id: raw._id, type: { $exists: false }, appId: raw.appId ?? null },
      { $set: { type: result.type } }
    );
    if (updated.matchedCount) return;
  }
  throw new Error('API Key binding changed repeatedly while backfilling');
};
