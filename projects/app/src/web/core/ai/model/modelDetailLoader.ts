import type {
  GetModelDetailsBody,
  GetModelDetailsResponse,
  ModelDisplayDetail
} from '@fastgpt/global/openapi/core/ai/model/detail';

/**
 * 每次只请求一个模型；相同身份和 ID 复用在途请求及 30 秒内存缓存，不合并不同 ID。
 * 身份键由调用方包含团队、成员或外链凭证及登录代次；失败不缓存，容量有界。
 */
export const createModelDetailLoader = (
  request: (body: GetModelDetailsBody) => Promise<GetModelDetailsResponse>
) => {
  type Entry = { promise: Promise<ModelDisplayDetail>; expiresAt: number };
  const cache = new Map<string, Entry>();
  return ({
    identity,
    modelId,
    outLinkAuthData,
    force = false
  }: {
    identity: string;
    modelId: string;
    outLinkAuthData?: GetModelDetailsBody['outLinkAuthData'];
    force?: boolean;
  }) => {
    const key = JSON.stringify([identity, modelId]);
    const cached = cache.get(key);
    if (cached && (cached.expiresAt === Infinity || (!force && cached.expiresAt > Date.now()))) {
      return cached.promise;
    }
    const entry: Entry = {
      expiresAt: Infinity,
      promise: request({ modelIds: [modelId], outLinkAuthData })
        .then((response) => {
          const detail = response.models.find((model) => model.modelId === modelId);
          if (!detail) throw new Error('Missing model display details');
          entry.expiresAt = Date.now() + 30_000;
          return detail;
        })
        .catch((error) => {
          if (cache.get(key) === entry) cache.delete(key);
          throw error;
        })
    };
    cache.set(key, entry);
    if (cache.size > 256) cache.delete(cache.keys().next().value!);
    return entry.promise;
  };
};
