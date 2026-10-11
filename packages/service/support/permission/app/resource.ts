import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import { UserError } from '@fastgpt/global/common/error/utils';
import type { AppResource, AppResourcesType } from '@fastgpt/global/core/app/type';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { AuthUserTypeEnum, ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { Types, type ClientSession } from '../../../common/mongo';
import type { ModelHandle } from '../../../core/ai/model/catalog/handle';
import { getTeamModelHandle } from '../../../core/ai/model/catalog/service';
import {
  getAppResourceKey,
  hasAppResource,
  mergeAppResources,
  splitExtractedAppResources
} from '../../../core/app/resources';
import { MongoApp } from '../../../core/app/schema';
import {
  getAppDraftResourceBaseline,
  getAppLatestVersion
} from '../../../core/app/version/controller';
import { getTmbInfoByTmbId } from '../../user/team/controller';
import { authDatasetByTmbId } from '../dataset/auth';
import { assertAuthModels, authModels } from '../model/auth';
import { authSkillByTmbId } from '../skill/auth';
import { authAppByTmbId } from './auth';

import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { SkillErrEnum } from '@fastgpt/global/common/error/code/skill';

type UnauthorizedAppResource = {
  resource: AppResource;
  error: unknown;
};

// 已知业务无权限与资源已删除错误标识
const KNOWN_UNAUTHORIZED_ERRORS = new Set<string>([
  AppErrEnum.unAuthApp,
  AppErrEnum.unExist,
  DatasetErrEnum.unAuthDataset,
  DatasetErrEnum.unExist,
  SkillErrEnum.unAuthSkill,
  SkillErrEnum.unExist,
  ModelErrEnum.unExist,
  ERROR_ENUM.unAuthModel,
  ERROR_ENUM.unAuthorization,
  CommonErrEnum.fileNotFound,
  CommonErrEnum.unAuthFile,
  'member not exist',
  'tmbId or userId is required',
  'Member not found',
  'Permission denied',
  'permission denied'
]);

const getErrorKey = (error: unknown): string => {
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const err = error as Record<string, any>;
    return String(err.statusText || err.message || err.reason || err.code || '');
  }
  return '';
};

/** 判断是否属于已知明确的无权限 / 资源不存在业务错误。 */
export const isKnownUnauthorizedError = (error: unknown): boolean => {
  return KNOWN_UNAUTHORIZED_ERRORS.has(getErrorKey(error));
};

/** 判断是否属于已知明确的成员不存在或已离职错误。 */
export const isKnownMemberNotExistError = (error: unknown): boolean => {
  const key = getErrorKey(error);
  return (
    key === 'member not exist' ||
    key === 'tmbId or userId is required' ||
    key === 'Member not found'
  );
};

/**
 * 返回当前成员不可读或不存在的资源。
 *
 * App、Dataset 和 Skill 复用各自的标准鉴权函数，避免在 App 域复制权限继承规则。
 * root 仅在 Test/Debug 显式允许时跨团队读取资源。
 * 仅处理明确已知的无权限错误并标记绕过，其他任何未知异常直接抛出。
 */
export const getUnauthorizedAppResources = async ({
  resources,
  tmbId,
  isRoot = false,
  allowRootCrossTeam = false,
  modelHandle
}: {
  resources: AppResource[];
  tmbId: string;
  isRoot?: boolean;
  allowRootCrossTeam?: boolean;
  /** 调用方已读取的同团队模型目录；不传时按成员所属团队读取。 */
  modelHandle?: ModelHandle;
}) => {
  const normalizedResources = mergeAppResources(resources);
  const modelResources = normalizedResources.filter((resource) => resource.type === 'model');
  const modelCatalog = await (async () => {
    if (modelResources.length === 0) return;
    const { teamId, permission } = await getTmbInfoByTmbId({ tmbId });
    const handle = modelHandle ?? (await getTeamModelHandle({ teamId }));
    const denied = await authModels({
      actor: { teamId, tmbId, isRoot, teamPermission: permission },
      modelIds: modelResources.map(({ id }) => id),
      action: 'use',
      handle
    });
    return {
      activeModelIds: new Set(handle.getActiveModels().map((model) => model.modelId)),
      deniedModelIds: new Set(denied)
    };
  })();
  const rootAccess = isRoot && allowRootCrossTeam;

  const results = await Promise.all(
    normalizedResources.map(async (resource): Promise<UnauthorizedAppResource | undefined> => {
      try {
        if (resource.type === 'agent' || resource.type === 'tool') {
          if (!Types.ObjectId.isValid(resource.id)) {
            return { resource, error: AppErrEnum.unExist };
          }
          await authAppByTmbId({
            appId: resource.id,
            tmbId,
            per: ReadPermissionVal,
            isRoot: rootAccess
          });
          return;
        }
        if (resource.type === 'dataset') {
          if (!Types.ObjectId.isValid(resource.id)) {
            return { resource, error: DatasetErrEnum.unExist };
          }
          await authDatasetByTmbId({
            datasetId: resource.id,
            tmbId,
            per: ReadPermissionVal,
            isRoot: rootAccess
          });
          return;
        }
        if (resource.type === 'skill') {
          if (!Types.ObjectId.isValid(resource.id)) {
            return { resource, error: SkillErrEnum.unExist };
          }
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
        if (modelCatalog.deniedModelIds.has(resource.id)) {
          return { resource, error: ERROR_ENUM.unAuthModel };
        }
      } catch (error) {
        if (isKnownUnauthorizedError(error)) {
          return { resource, error };
        }
        throw error;
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
 * 过滤操作人有权限访问的资源快照：
 * 1. 仅保留操作人有读取权限的资源，无权限项静默剔除；
 * 2. 若明确为成员不存在或离职，按安全规则全部剔除为 []；
 * 3. 其他非无权限异常一律直接抛出，让外层记录错误并触发重试。
 */
export const filterAuthorizedAppResources = async ({
  resources,
  tmbId,
  isRoot = false,
  allowRootCrossTeam = false,
  modelHandle
}: {
  resources: AppResource[];
  tmbId: unknown;
  isRoot?: boolean;
  allowRootCrossTeam?: boolean;
  modelHandle?: ModelHandle;
}): Promise<AppResource[]> => {
  if (resources.length === 0) return [];

  const validTmbId = typeof tmbId === 'string' && tmbId.length > 0 ? tmbId : String(tmbId ?? '');
  if (!validTmbId || !Types.ObjectId.isValid(validTmbId)) {
    return [];
  }

  try {
    await getTmbInfoByTmbId({ tmbId: validTmbId });
  } catch (error) {
    if (isKnownMemberNotExistError(error)) {
      return [];
    }
    throw error;
  }

  const unauthorized = await getUnauthorizedAppResources({
    resources,
    tmbId: validTmbId,
    isRoot,
    allowRootCrossTeam,
    modelHandle
  });
  if (unauthorized.length === 0) return resources;

  const unauthorizedKeys = new Set(unauthorized.map((item) => getAppResourceKey(item.resource)));
  return resources.filter((resource) => !unauthorizedKeys.has(getAppResourceKey(resource)));
};

/**
 * 按当前应用草稿快照解析资源，并只校验相对快照新增的 ACL 资源。
 * 保存/自动保存不阻断无权限新增；发布和 Test/Debug 通过 blockOnUnauthorized 阻断。
 * 历史未迁移草稿（缺失 resources 字段）统一按所属应用的所有者 app.tmbId 过滤基线。
 */
export const resolveAppResourcesByPermission = async ({
  appId,
  extracted,
  tmbId,
  isRoot = false,
  blockOnUnauthorized,
  allowRootCrossTeam = false,
  modelHandle,
  session
}: {
  appId: string;
  extracted: AppResource[];
  tmbId: string;
  isRoot?: boolean;
  blockOnUnauthorized: boolean;
  allowRootCrossTeam?: boolean;
  /** 调用方已读取的团队模型目录；不传时按需读取。 */
  modelHandle?: ModelHandle;
  session?: ClientSession;
}) => {
  const baseline = await getAppDraftResourceBaseline(appId, session, async (rawResources) => {
    // 只有历史草稿缺少 resources、需要从旧字段重建基线时，才查询应用所有者。
    // 已有合法快照会在 getAppDraftResourceBaseline 内直接返回，避免额外一次数据库请求。
    const app = await MongoApp.findById(appId, 'tmbId')
      .session(session ?? null)
      .lean();
    const appOwnerTmbId = app?.tmbId ? String(app.tmbId) : undefined;
    if (!appOwnerTmbId) return [];

    return filterAuthorizedAppResources({
      resources: rawResources,
      tmbId: appOwnerTmbId,
      isRoot,
      allowRootCrossTeam,
      modelHandle
    });
  });
  const { kept, added } = splitExtractedAppResources({ extracted, baseline });
  if (added.length === 0) return mergeAppResources(kept);

  if (blockOnUnauthorized) {
    await checkAppResourceReadPermissions({
      resources: added,
      tmbId,
      isRoot,
      allowRootCrossTeam,
      modelHandle
    });
    return mergeAppResources([...kept, ...added]);
  }

  const authorizedAdded = await filterAuthorizedAppResources({
    resources: added,
    tmbId,
    isRoot,
    allowRootCrossTeam,
    modelHandle
  });
  return mergeAppResources([...kept, ...authorizedAdded]);
};

/**
 * 校验独立辅助调用点（如问题引导、TTS 音频生成）使用的模型资源。
 * - 目标为 App：与工作流资源同一条链路，先查应用快照，再按身份决定是否允许成员鉴权兜底。
 *   1. 命中当前正式 Version 快照直接放行（正式对话、外链、API Key 共用）；
 *   2. 未命中时，只有登录成员（authType=token，唯一能进入 Test/Debug 的身份）继续走调试链路：
 *      草稿快照基线内的模型放行，相对草稿新增的模型按成员 `use` 权限阻断校验，
 *      与 chatTest/debug 中知识库等资源的 `resolveAppResourcesByPermission` 规则一致；
 *   3. 外链 / API Key 只能使用正式版本，未命中直接拒绝。
 * - 非 App（skillEdit、chatAgentHelper）：只有登录成员能进入，直接按成员 `use` 权限校验。
 * 模型类型与启用状态由调用方的 typed getter 校验；调用方必须传入读取模型时使用的 handle，避免重复读取目录。
 */
export const authTargetModelResource = async ({
  targetType,
  targetId,
  modelId,
  teamId,
  tmbId,
  isRoot,
  authType,
  handle,
  resources
}: {
  targetType: ChatSourceTypeEnum;
  targetId?: string;
  modelId: string;
  teamId: string;
  tmbId: string;
  isRoot: boolean;
  /** 本次请求身份类型；只有 token 允许走草稿快照与成员鉴权兜底。 */
  authType?: `${AuthUserTypeEnum}`;
  handle: ModelHandle;
  /** App 正式版本资源快照；调用方已读取版本时传入，避免重复查询。 */
  resources?: AppResourcesType;
}) => {
  if (targetType === ChatSourceTypeEnum.app && targetId) {
    const modelResource: AppResource = { type: 'model', id: modelId };
    const published = resources ?? (await getAppLatestVersion(targetId)).resources;
    if (hasAppResource({ resources: published, resource: modelResource })) return;

    if (authType !== AuthUserTypeEnum.token) {
      throw new UserError(ModelErrEnum.unAuthModel);
    }
    await resolveAppResourcesByPermission({
      appId: targetId,
      extracted: [modelResource],
      tmbId,
      isRoot,
      blockOnUnauthorized: true,
      allowRootCrossTeam: isRoot,
      modelHandle: handle
    });
    return;
  }
  await assertAuthModels({
    actor: { teamId, tmbId, isRoot },
    modelIds: [modelId],
    action: 'use',
    handle
  });
};
