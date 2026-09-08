import type {
  GetModelSummariesBody,
  GetModelSummariesResponse,
  ModelSummary
} from '@fastgpt/global/openapi/core/ai/model/summary';

/**
 * 每次只请求一个模型；相同身份和 ID 复用在途请求及 30 秒内存缓存，不合并不同 ID。
 * 身份键由调用方包含团队、成员或外链凭证及登录代次；失败不缓存，容量有界。
 */
export const createModelSummaryLoader = (
  request: (body: GetModelSummariesBody) => Promise<GetModelSummariesResponse>
) => {
  type Entry = {
    promise: Promise<ModelSummary>;
    expiresAt: number;
    detail?: ModelSummary;
  };
  type Key = { identity: string; modelId: string };
  const cache = new Map<string, Entry>();
  const getKey = ({ identity, modelId }: Key) => JSON.stringify([identity, modelId]);
  const save = (key: string, entry: Entry) => {
    cache.set(key, entry);
    if (cache.size > 256) cache.delete(cache.keys().next().value!);
  };
  const load = ({
    identity,
    modelId,
    outLinkAuthData,
    force = false
  }: {
    identity: string;
    modelId: string;
    outLinkAuthData?: GetModelSummariesBody['outLinkAuthData'];
    force?: boolean;
  }) => {
    const key = getKey({ identity, modelId });
    const cached = cache.get(key);
    if (cached && (cached.expiresAt === Infinity || (!force && cached.expiresAt > Date.now()))) {
      return cached.promise;
    }
    const entry: Entry = {
      expiresAt: Infinity,
      promise: request({ modelIds: [modelId], outLinkAuthData })
        .then((response) => {
          // 请求发出后可能已通过新 catalog 确认状态，旧响应不能覆盖新选择。
          const newer = cache.get(key);
          if (newer !== entry && newer?.detail) return newer.detail;
          const detail = response.models.find((model) => model.modelId === modelId);
          if (!detail) throw new Error('Missing model display details');
          entry.detail = detail;
          entry.expiresAt = Date.now() + 30_000;
          return detail;
        })
        .catch((error) => {
          const newer = cache.get(key);
          if (newer !== entry && newer?.detail) return newer.detail;
          if (cache.get(key) === entry) cache.delete(key);
          throw error;
        })
    };
    save(key, entry);
    return entry.promise;
  };
  return Object.assign(load, {
    /** 同步回显可靠缓存，选中 catalog 候选后不闪现 loading。 */
    peek: (key: Key) => {
      const entry = cache.get(getKey(key));
      return entry && entry.expiresAt > Date.now() ? entry.detail : undefined;
    },
    /** 将刚校验的 catalog 展示数据写入同身份详情缓存，不发请求。 */
    prime: ({ identity, detail }: { identity: string; detail: ModelSummary }) => {
      save(getKey({ identity, modelId: detail.modelId }), {
        promise: Promise.resolve(detail),
        detail,
        expiresAt: Date.now() + 30_000
      });
    },
    /** 仅使当前 ID 的已完成缓存失效；在途请求仍复用，强刷不会影响后续其他模型。 */
    invalidate: (key: Key) => {
      const cacheKey = getKey(key);
      if (cache.get(cacheKey)?.expiresAt !== Infinity) cache.delete(cacheKey);
    }
  });
};
