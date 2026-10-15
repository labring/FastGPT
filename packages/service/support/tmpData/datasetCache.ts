import type { AsyncCache } from '../../common/cache/type';
import { hashStr } from '@fastgpt/global/common/string/tools';
import type { TmpDataSchema } from '@fastgpt/global/support/tmpData/type';
import { MongoTmpData } from './schema';

/**
 * 创建知识库 get/set 缓存适配器。namespace 隔离调用场景，key 哈希后落库，读取不续期。
 * 过期记录主动排除，不依赖 MongoDB TTL 清理时机；数据包装后可缓存数组及基础类型。
 */
export const createDatasetCache = ({
  namespace,
  ttlMs
}: {
  namespace: string;
  ttlMs: number;
}): AsyncCache => {
  const dataIdOf = (key: string) => `datasetCache:v1:${hashStr(JSON.stringify([namespace, key]))}`;
  return {
    get: async (key) => {
      const entry = await MongoTmpData.findOne({
        dataId: dataIdOf(key),
        expireAt: { $gt: new Date() }
      }).lean<TmpDataSchema<{ value: unknown }>>();
      return entry?.data?.value;
    },
    set: async (key, value) => {
      await MongoTmpData.updateOne(
        { dataId: dataIdOf(key) },
        { $set: { data: { value }, expireAt: new Date(Date.now() + ttlMs) } },
        { upsert: true }
      );
    }
  };
};
