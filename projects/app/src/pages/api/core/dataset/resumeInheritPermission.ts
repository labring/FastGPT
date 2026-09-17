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
    affectedResourceCount = await resumeInheritPermission({
      resource: dataset,
      folderTypeList: [DatasetTypeEnum.folder],
      resourceType: PerResourceTypeEnum.dataset,
      resourceModel: MongoDataset
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
