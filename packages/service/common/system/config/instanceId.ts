/**
 * 部署实例 ID 工具 — 替代原 hosts（域名）绑定标记。
 *
 * 设计（见 .agents/design/admin/license-instance-id-redesign.md §6.4）：
 * - 首次调用用 findOneAndUpdate + $setOnInsert 原子生成；固定 _id 利用主键唯一约束，
 *   保证多实例并发首启时只有一个插入成功，其余返回已存在文档（type 索引非唯一，
 *   不能依赖 type 做并发去重——fastgpt/fastgptPro 需要同 type 多文档历史）
 * - 之后永不 update：换 license / 重签 / 删 license 均不影响身份
 * - change stream 只对 fastgptPro/license 的 insert 触发配置重载，instanceId 的 insert 零副作用
 * - 纯 DB 存储，不做文件双写（多实例不一致 + 迁移丢失）
 */
import crypto from 'crypto';
import { SystemConfigsTypeEnum } from '@fastgpt/global/common/system/config/constants';
import { MongoSystemConfigs } from './schema';

/** 固定 _id（24 位 hex，合法 ObjectId）：主键唯一约束保证并发下只生成一次 */
const INSTANCE_ID_DOC_ID = '000000000000000000000001';

export const getInstanceId = async (): Promise<string> => {
  const doc = await MongoSystemConfigs.findOneAndUpdate(
    { _id: INSTANCE_ID_DOC_ID },
    {
      $setOnInsert: {
        _id: INSTANCE_ID_DOC_ID,
        type: SystemConfigsTypeEnum.instanceId,
        value: {
          instanceId: crypto.randomBytes(16).toString('hex') // 32 位 hex
        },
        createTime: new Date()
      }
    },
    { upsert: true, new: true }
  );

  return doc.value.instanceId as string;
};
