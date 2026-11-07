import type { ClientSession } from '../../../common/mongo';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { resourcePermissionRepo } from '../../../support/permission/repository/resourcePermissionRepo';
import { MongoModelStatusProbeRecord } from '../modelStatus/schema';
import { MongoAIModel } from './schema';

/**
 * 普通删除与 JSON 替换共用的跨域清理：实体、各团队 ACL、探测历史在同一事务内删除。
 * 系统模型的 ACL 可分布于多个团队，按全局唯一 modelId 清理，不能只删除操作者所在团队。
 */
export const deleteModelRecords = async (modelIds: string[], session: ClientSession) => {
  if (modelIds.length === 0) return;
  await MongoAIModel.deleteMany({ _id: { $in: modelIds } }, { session });
  await resourcePermissionRepo.deleteByResourceIdsAcrossTeams({
    resourceType: PerResourceTypeEnum.model,
    resourceIds: modelIds,
    session
  });
  await MongoModelStatusProbeRecord.deleteMany({ modelId: { $in: modelIds } }, { session });
};
