import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';

import type { AppResource } from '@fastgpt/global/core/app/type';

import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { Types } from '../../../common/mongo';
import type { ModelHandle } from '../../../core/ai/model/catalog/handle';
import { getTeamModelHandle } from '../../../core/ai/model/catalog/service';
import { getAppResourceKey, mergeAppResources } from '../../../core/app/resource/utils';

import { getTmbInfoByTmbId } from '../../user/team/controller';
import { authDatasetByTmbId } from '../dataset/auth';
import { authModels } from '../model/auth';
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
    if (
      ['member not exist', 'tmbId or userId is required', 'Member not found'].includes(
        getErrorKey(error)
      )
    ) {
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
