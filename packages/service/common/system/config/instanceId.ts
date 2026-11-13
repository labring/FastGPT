/**
 * Mongo 持久化的部署身份，供 license 绑定与共享基础设施资源归属共同使用。
 *
 * 使用固定文档主键和 $setOnInsert，保证多实例并发首次启动时只生成一个 ID；
 * 后续换 license、重签或删除 license 都不会改变部署身份。
 */
import crypto from 'crypto';
import { SystemConfigsTypeEnum } from '@fastgpt/global/common/system/config/constants';
import { MongoSystemConfigs } from './schema';

/** 固定 _id（24 位 hex，合法 ObjectId）：主键唯一约束保证并发下只生成一次。 */
const INSTANCE_ID_DOC_ID = '000000000000000000000001';

/**
 * 进程级部署身份缓存。
 *
 * `instanceId` 一旦写入固定主键文档便终身不变；缓存 Promise 可同时合并冷启动并发请求，
 * 避免每次沙箱运行态连接、文件读写、预览和卷管理操作都在同一条系统配置文档上申请排他写锁。
 */
let cachedInstanceIdPromise: Promise<string> | null = null;

/** 重置进程内 `instanceId` 缓存（仅供清库重跑的单元测试使用）。 */
export const resetInstanceIdCacheForTest = (): void => {
  cachedInstanceIdPromise = null;
};

/**
 * 获取并持久化当前部署实例 ID。
 *
 * 进程内通过 `cachedInstanceIdPromise` 缓存并合并冷启动并发请求；首次初始化执行单次
 * `$setOnInsert` upsert，若多副本首次冷启动同时写入触发 `E11000` 主键冲突则回退重读胜出文档。
 */
export const getInstanceId = async (): Promise<string> => {
  if (cachedInstanceIdPromise) {
    return cachedInstanceIdPromise;
  }

  const extractInstanceId = (doc: unknown): string | undefined => {
    const id = (doc as { value?: { instanceId?: unknown } } | null)?.value?.instanceId;
    return typeof id === 'string' && id.trim().length > 0 ? id : undefined;
  };

  const loadPromise = (async (): Promise<string> => {
    const generatedId = crypto.randomBytes(16).toString('hex');
    try {
      const doc = await MongoSystemConfigs.findOneAndUpdate(
        { _id: INSTANCE_ID_DOC_ID },
        {
          $setOnInsert: {
            _id: INSTANCE_ID_DOC_ID,
            type: SystemConfigsTypeEnum.instanceId,
            value: {
              instanceId: generatedId
            },
            createTime: new Date()
          }
        },
        { upsert: true, new: true }
      ).lean();
      const id = extractInstanceId(doc);
      if (id) {
        return id;
      }
    } catch (error) {
      // 多副本首次冷启动同时 upsert 固定 _id 时，MongoDB 可能对后到写入返回 E11000，回退重读即可。
      if ((error as { code?: unknown })?.code !== 11000) {
        throw error;
      }
    }

    const fallbackDoc = await MongoSystemConfigs.findOne({ _id: INSTANCE_ID_DOC_ID }).lean();
    const fallbackId = extractInstanceId(fallbackDoc);
    if (!fallbackId) {
      throw new Error('Failed to initialize persistent deployment instanceId');
    }
    return fallbackId;
  })();

  cachedInstanceIdPromise = loadPromise;
  try {
    return await loadPromise;
  } catch (error) {
    if (cachedInstanceIdPromise === loadPromise) {
      cachedInstanceIdPromise = null;
    }
    throw error;
  }
};
