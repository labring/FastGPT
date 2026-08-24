import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps, NextApiResponse } from '@fastgpt/next/type';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import {
  runFullTextMigration,
  type InitMilvusFullTextResult
} from '@fastgpt/service/core/dataset/fullText/migration';

export type Query = {
  /** 每批条数,默认 500 */
  batchSize?: string;
  /** dryRun=true | 1:只统计不写入 */
  dryRun?: string;
  /** removeOld=true | 1:迁移校验通过后直接 drop 原 modeldata collection */
  removeOld?: string;
  /** 断点续跑:沿用已有 migrationId */
  resumeMigrationId?: string;
};

export const parseQuery = (q: Query) => ({
  batchSize: q.batchSize ? Number(q.batchSize) : undefined,
  dryRun: q.dryRun === 'true' || q.dryRun === '1',
  removeOld: q.removeOld === 'true' || q.removeOld === '1',
  resumeMigrationId: q.resumeMigrationId
});

/**
 * 全文检索引擎全量迁移脚本(旧表 modeldata 纯拷贝)。
 * 方向固定 mongo -> milvus,实际向量库必须为 milvus(全文后端跟随 provider)。
 * 遍历 milvus `modeldata` 向量行 + join mongo dataset_data 取 text,写入 `modeldata_v2`(不重嵌入)。
 * `imageEmbedding` 只保留向量,BM25 文本置空。
 *
 * 前提:Milvus 数据仍在(旧表 `modeldata` 存在且有向量)。若 Milvus 数据已不存在
 * (跨版本升级后的全新实例),请改用 `POST /api/core/dataset/training/rebuildEmbedding`
 * 从 dataset_data 全量重新嵌入。本接口在旧表缺失/为空时会报错并给出该提示。
 *
 * 校验通过后 release 旧 `modeldata`;`removeOld=1` 时显式 drop 旧表并清空 `dataset_data_texts`
 * (管理员验证后主动删除)。
 *
 * 注意:该接口为同步长任务(小时级)。进度按批持久化到 full_text_migration_logs,失败行落
 * full_text_migration_failed;若请求被网关/代理超时中断,进度保留,用 resumeMigrationId 续跑
 * (续跑会续起计数并自愈重试失败表遗留行)。迁移中途异常时日志会被标记为 failed,不会卡在 running。
 * 客户端中断(curl ctrl+C / 断连)即取消:主循环在下批边界停止并标记 cancelled,进度保留可续跑。
 * 迁移进行中再次调用(不带 resumeMigrationId)会被拒绝,防止两个循环并发处理同一批源行。
 *
 * 示例:
 *   curl 'http://host/api/admin/initMilvusFullText?batchSize=500&dryRun=1'
 *   curl 'http://host/api/admin/initMilvusFullText?removeOld=1'
 *   curl 'http://host/api/admin/initMilvusFullText?resumeMigrationId=<uuid>'
 *   # 取消:中断进行中的 curl(Ctrl+C)即可,无需再调接口
 */
async function handler(
  req: ApiRequestProps<unknown, Query>,
  res: NextApiResponse
): Promise<InitMilvusFullTextResult> {
  await authCert({ req, authRoot: true });

  const q = parseQuery(req.query);

  // 客户端中断(curl ctrl+C / 断连)即取消:置位 signal,主循环下批边界停并标记 cancelled,进度可续跑。
  // 仅当响应未正常写完就断连(writableEnded=false)才视为取消;正常完成后响应已写完,不受影响。
  const signal = { cancelled: false };
  res.on('close', () => {
    if (!res.writableEnded) signal.cancelled = true;
  });

  return runFullTextMigration({ ...q, signal });
}

export default NextAPI(handler);
