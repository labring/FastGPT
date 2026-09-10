import type { AppResource, AppResourcesType } from '@fastgpt/global/core/app/type';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import type { ClientSession } from '../../../common/mongo';
import {
  getAppResourceKey,
  hasAppResource,
  mergeAppResources,
  splitExtractedAppResources
} from '../../../core/app/resources';
import {
  getAppDraftResourceBaseline,
  getAppLatestVersion
} from '../../../core/app/version/controller';
import { authDatasetByTmbId } from '../dataset/auth';
import { authSkillByTmbId } from '../skill/auth';
import { getTmbInfoByTmbId } from '../../user/team/controller';
import { getMemberModelIds } from '../model/controller';
import { authAppByTmbId } from './auth';
import { getModelHandle } from '../../../core/ai/model';

type UnauthorizedAppResource = {
  resource: AppResource;
  error: unknown;
};

/**
 * 返回当前成员不可读或不存在的资源。
 *
 * App、Dataset 和 Skill 复用各自的标准鉴权函数，避免在 App 域复制权限继承规则。
 * root 仅在 Test/Debug 显式允许时跨团队读取资源。
 */
export const getUnauthorizedAppResources = async ({
  resources,
  tmbId,
  isRoot = false,
  allowRootCrossTeam = false
}: {
  resources: AppResource[];
  tmbId: string;
  isRoot?: boolean;
  allowRootCrossTeam?: boolean;
}) => {
  const normalizedResources = mergeAppResources(resources);
  const modelResources = normalizedResources.filter((resource) => resource.type === 'model');
  const modelCatalog = await (async () => {
    if (modelResources.length === 0) return;
    const handle = await getModelHandle();
    return {
      snapshot: { models: handle.getAllModels(), revision: handle.revision },
      activeModelIds: new Set(handle.getActiveModels().map((model) => model.modelId))
    };
  })();
  const permittedModelIds = await (async () => {
    if (modelResources.length === 0) return new Set<string>();

    const { teamId, permission } = await getTmbInfoByTmbId({ tmbId });
    const modelIds = await getMemberModelIds({
      teamId,
      tmbId,
      isTeamOwner: permission.isOwner || (isRoot && allowRootCrossTeam),
      catalogSnapshot: modelCatalog?.snapshot
    });
    return new Set(modelIds);
  })();
  const rootAccess = isRoot && allowRootCrossTeam;

  const results = await Promise.all(
    normalizedResources.map(async (resource): Promise<UnauthorizedAppResource | undefined> => {
      try {
        if (resource.type === 'agent' || resource.type === 'tool') {
          await authAppByTmbId({
            appId: resource.id,
            tmbId,
            per: ReadPermissionVal,
            isRoot: rootAccess
          });
          return;
        }
        if (resource.type === 'dataset') {
          await authDatasetByTmbId({
            datasetId: resource.id,
            tmbId,
            per: ReadPermissionVal,
            isRoot: rootAccess
          });
          return;
        }
        if (resource.type === 'skill') {
          await authSkillByTmbId({
            skillId: resource.id,
            tmbId,
            per: ReadPermissionVal,
            isRoot: rootAccess
          });
          return;
        }

        if (!modelCatalog?.activeModelIds.has(resource.id)) {
          return { resource, error: ModelErrEnum.unExist };
        }
        if (!permittedModelIds.has(resource.id)) {
          return { resource, error: ERROR_ENUM.unAuthModel };
        }
      } catch (error) {
        return { resource, error };
      }
    })
  );

  return results.filter((result): result is UnauthorizedAppResource => result !== undefined);
};

/** 在保存、发布或 Test/Debug 边界校验应用引用资源的读取权限。 */
export const checkAppResourceReadPermissions = async (
  props: Parameters<typeof getUnauthorizedAppResources>[0]
) => {
  const unauthorized = await getUnauthorizedAppResources(props);
  if (unauthorized[0]) throw unauthorized[0].error;
};

/**
 * 按当前应用草稿快照解析资源，并只校验相对快照新增的 ACL 资源。
 * 保存/自动保存不阻断无权限新增；发布和 Test/Debug 通过 blockOnUnauthorized 阻断。
 */
export const resolveAppResourcesByPermission = async ({
  appId,
  extracted,
  tmbId,
  isRoot = false,
  blockOnUnauthorized,
  allowRootCrossTeam = false,
  session
}: {
  appId: string;
  extracted: AppResource[];
  tmbId: string;
  isRoot?: boolean;
  blockOnUnauthorized: boolean;
  allowRootCrossTeam?: boolean;
  session?: ClientSession;
}) => {
  const baseline = await getAppDraftResourceBaseline(appId, session);
  const { kept, added } = splitExtractedAppResources({ extracted, baseline });
  if (added.length === 0) return mergeAppResources(kept);

  if (blockOnUnauthorized) {
    await checkAppResourceReadPermissions({
      resources: added,
      tmbId,
      isRoot,
      allowRootCrossTeam
    });
    return mergeAppResources([...kept, ...added]);
  }

  const unauthorized = await getUnauthorizedAppResources({
    resources: added,
    tmbId,
    isRoot,
    allowRootCrossTeam
  });
  const unauthorizedKeys = new Set(unauthorized.map((item) => getAppResourceKey(item.resource)));
  return mergeAppResources([
    ...kept,
    ...added.filter((resource) => !unauthorizedKeys.has(getAppResourceKey(resource)))
  ]);
};

/**
 * 校验独立辅助调用点（如问题引导、TTS 音频生成）使用的模型资源。
 * 目标为 App 时严格校验当前正式 Version 的资源快照；非 App 或动态场景按成员个人模型权限校验。
 */
export const authTargetModelResource = async ({
  targetType,
  targetId,
  modelId,
  tmbId,
  resources
}: {
  targetType: ChatSourceTypeEnum;
  targetId?: string;
  modelId: string;
  tmbId: string;
  resources?: AppResourcesType;
}) => {
  const modelResource = { type: 'model' as const, id: modelId };
  if (targetType === ChatSourceTypeEnum.app && targetId) {
    const snapshot = resources ?? (await getAppLatestVersion(targetId)).resources;
    if (!hasAppResource({ resources: snapshot, resource: modelResource })) {
      throw ERROR_ENUM.unAuthModel;
    }
    return;
  }
  await checkAppResourceReadPermissions({ resources: [modelResource], tmbId });
};
