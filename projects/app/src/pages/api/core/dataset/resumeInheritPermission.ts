import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import {
  ManagePermissionVal,
  PerResourceTypeEnum
} from '@fastgpt/global/support/permission/constant';
import { resumeInheritPermission } from '@fastgpt/service/support/permission/inheritPermission';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import {
  ResumeDatasetInheritPermissionBodySchema,
  type ResumeDatasetInheritPermissionBody
} from '@fastgpt/global/openapi/core/dataset/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { getResourceOwnedClbs } from '@fastgpt/service/support/permission/controller';
import { syncDatasetToCollections } from '@fastgpt/service/support/permission/collection/controller';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { getParents } from './paths';

const logger = getLogger(LogCategories.MODULE.DATASET);

async function handler(req: ApiRequestProps<ResumeDatasetInheritPermissionBody>) {
  const { datasetId } = parseApiInput({
    req,
    bodySchema: ResumeDatasetInheritPermissionBodySchema
  }).body;
  const { dataset, teamId, tmbId } = await authDataset({
    datasetId,
    req,
    authToken: true,
    per: ManagePermissionVal
  });

  // 复用已有的祖先链查询，一次拿到目标路径和直接上级名称
  const parentPaths = await getParents(dataset.parentId ?? undefined);
  const parentDatasetName = parentPaths.at(-1)?.parentName;

  let affectedResourceCount = 1;
  if (dataset.parentId) {
    await mongoSessionRun(async (session) => {
      // 恢复继承会重算 dataset 自身快照（旧独立快照 → merge(父级, 自身) 全量快照），
      // 同一事务内读取变更前后有效 clbs 并跨树重物化其下 collection 快照。
      const oldEffectiveClbs = await getResourceOwnedClbs({
        teamId,
        resourceId: datasetId,
        resourceType: PerResourceTypeEnum.dataset,
        session
      });
      // 事务内采集受影响资源数：审计要描述的是本次真正生效的影响范围；
      // 事务回滚时整个 handler 会抛出，不会走到后面的 addAuditLog
      affectedResourceCount = await resumeInheritPermission({
        resource: dataset,
        folderTypeList: [DatasetTypeEnum.folder],
        resourceType: PerResourceTypeEnum.dataset,
        resourceModel: MongoDataset,
        session
      });
      const newEffectiveClbs = await getResourceOwnedClbs({
        teamId,
        resourceId: datasetId,
        resourceType: PerResourceTypeEnum.dataset,
        session
      });
      await syncDatasetToCollections({
        teamId,
        datasetId: String(dataset._id),
        oldEffectiveClbs,
        newEffectiveClbs,
        session
      });
    });
  } else {
    await MongoDataset.updateOne(
      {
        _id: datasetId
      },
      {
        inheritPermission: true
      }
    );
  }

  // 权限恢复成功后才写入事件，失败时不记成功审计。
  // 低频管理操作，这里等待落库后再返回：保证“接口成功 ⇒ 审计已落库或已记错误日志”，
  // 避免旁路异步写入给手动验收留下“操作成功但查不到记录”的窗口。
  await addAuditLog({
    teamId,
    tmbId,
    scope: 'member',
    event: AuditEventEnum.RESUME_INHERIT_PERMISSION,
    params: {
      datasetId,
      datasetName: dataset.name,
      targetPath: [...parentPaths.map((path) => path.parentName), dataset.name].join('/'),
      parentDatasetName: parentDatasetName ?? '-',
      oldPermissionSource: 'self',
      newPermissionSource: parentDatasetName ? 'parent' : 'team',
      affectedResourceCount
    }
  }).catch((error) => {
    logger.error('Failed to write resume inherit permission audit log', {
      error,
      datasetId
    });
  });
}
export default NextAPI(handler);
