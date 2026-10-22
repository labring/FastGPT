import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';

import type { AppResource } from '@fastgpt/global/core/app/type';
import { AgentSkillSourceEnum } from '@fastgpt/global/core/ai/skill/constants';
import { isTeamModel } from '@fastgpt/global/core/ai/model/utils';
import type { TeamTmbItemType } from '@fastgpt/global/support/user/team/type';

import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { Types, type ClientSession } from '../../../common/mongo';
import type { ModelHandle } from '../../../core/ai/model/catalog/handle';
import { getTeamModelHandle } from '../../../core/ai/model/catalog/service';
import { getAppResourceKey, mergeAppResources } from '../../../core/app/resource/utils';
import { MongoApp } from '../../../core/app/schema';
import { MongoDataset } from '../../../core/dataset/schema';
import { MongoAgentSkills } from '../../../core/ai/skill/model/schema';

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
 * 核对已授权快照的资源归属，不重新检查操作人的 ACL。
 * 按资源类型批量查询，系统模型和系统 Skill 保持全局可用；快照不能绕过团队边界。
 */
export const getAppResourcesOutsideTeam = async ({
  resources,
  teamId,
  modelHandle,
  session
}: {
  resources: AppResource[];
  teamId: string;
  modelHandle?: ModelHandle;
  session?: ClientSession;
}): Promise<UnauthorizedAppResource[]> => {
  const normalized = mergeAppResources(resources);
  const getIds = (types: AppResource['type'][]) =>
    normalized
      .filter((resource) => types.includes(resource.type) && Types.ObjectId.isValid(resource.id))
      .map(({ id }) => id);
  const appIds = getIds(['agent', 'tool']);
  const datasetIds = getIds(['dataset']);
  const skillIds = getIds(['skill']);
  // 保存和发布会传入事务 session，同一事务内的 MongoDB 查询必须依次执行。
  const apps = appIds.length
    ? await MongoApp.find({ _id: { $in: appIds }, teamId, deleteTime: null }, '_id')
        .session(session ?? null)
        .lean()
    : [];
  const datasets = datasetIds.length
    ? await MongoDataset.find({ _id: { $in: datasetIds }, teamId, deleteTime: null }, '_id')
        .session(session ?? null)
        .lean()
    : [];
  const skills = skillIds.length
    ? await MongoAgentSkills.find(
        {
          _id: { $in: skillIds },
          deleteTime: null,
          $or: [{ teamId }, { source: AgentSkillSourceEnum.system }]
        },
        '_id'
      )
        .session(session ?? null)
        .lean()
    : [];
  const handle = normalized.some(({ type }) => type === 'model')
    ? (modelHandle ?? (await getTeamModelHandle({ teamId })))
    : undefined;
  const allowedApps = new Set(apps.map(({ _id }) => String(_id)));
  const allowedDatasets = new Set(datasets.map(({ _id }) => String(_id)));
  const allowedSkills = new Set(skills.map(({ _id }) => String(_id)));
  const allowedModels = new Set(
    handle
      ?.getAllModels()
      .filter((model) => !isTeamModel(model) || String(model.teamId) === teamId)
      .map(({ modelId }) => modelId)
  );

  return normalized.flatMap((resource): UnauthorizedAppResource[] => {
    if (resource.type === 'agent' || resource.type === 'tool') {
      return allowedApps.has(resource.id) ? [] : [{ resource, error: AppErrEnum.unAuthApp }];
    }
    if (resource.type === 'dataset') {
      return allowedDatasets.has(resource.id)
        ? []
        : [{ resource, error: DatasetErrEnum.unAuthDataset }];
    }
    if (resource.type === 'skill') {
      return allowedSkills.has(resource.id) ? [] : [{ resource, error: SkillErrEnum.unAuthSkill }];
    }
    return allowedModels.has(resource.id) ? [] : [{ resource, error: ERROR_ENUM.unAuthModel }];
  });
};

/**
 * 返回当前成员不可读或不存在的资源。
 *
 * App、Dataset 和 Skill 复用各自的标准鉴权函数，避免在 App 域复制权限继承规则。
 * root 保留同团队资源的 ACL 旁路，任何身份都不能跨团队引用；系统模型和系统 Skill 除外。
 * 仅处理明确已知的无权限错误并标记绕过，其他任何未知异常直接抛出。
 */
export const getUnauthorizedAppResources = async ({
  resources,
  tmbId,
  teamId: targetTeamId,
  isRoot = false,
  modelHandle,
  tmbInfo: passedTmbInfo
}: {
  resources: AppResource[];
  tmbId: string;
  /** 已鉴权的目标团队；缺省使用操作人所属团队。 */
  teamId?: string;
  isRoot?: boolean;
  /** 调用方已读取的同团队模型目录；不传时按成员所属团队读取。 */
  modelHandle?: ModelHandle;
  tmbInfo?: Pick<TeamTmbItemType, 'teamId' | 'permission'>;
}) => {
  const normalizedResources = mergeAppResources(resources);
  const modelResources = normalizedResources.filter((resource) => resource.type === 'model');
  let tmbInfoPromise:
    | Promise<Pick<TeamTmbItemType, 'teamId' | 'permission'> | undefined>
    | undefined = passedTmbInfo ? Promise.resolve(passedTmbInfo) : undefined;
  const getTmbInfo = () => {
    if (!tmbInfoPromise) {
      tmbInfoPromise = getTmbInfoByTmbId({ tmbId });
    }
    return tmbInfoPromise;
  };

  const modelCatalog = await (async () => {
    if (modelResources.length === 0) return;
    const tmbInfo = await getTmbInfo();
    if (!tmbInfo) return;
    const { permission } = tmbInfo;
    const teamId = targetTeamId ?? tmbInfo.teamId;
    const handle = modelHandle ?? (await getTeamModelHandle({ teamId }));
    const denied = await authModels({
      actor: { teamId, tmbId, isRoot, teamPermission: permission },
      modelIds: modelResources.map(({ id }) => id),
      action: 'use',
      handle
    });
    return {
      activeModelIds: new Set(
        handle
          .getActiveModels()
          .filter((model) => !isTeamModel(model) || String(model.teamId) === teamId)
          .map((model) => model.modelId)
      ),
      deniedModelIds: new Set(denied)
    };
  })();

  const results = await Promise.all(
    normalizedResources.map(async (resource): Promise<UnauthorizedAppResource | undefined> => {
      try {
        if (resource.type === 'agent' || resource.type === 'tool') {
          if (!Types.ObjectId.isValid(resource.id)) {
            return { resource, error: AppErrEnum.unExist };
          }
          const tmbInfo = await getTmbInfo();
          const authorized = await authAppByTmbId({
            appId: resource.id,
            tmbId,
            per: ReadPermissionVal,
            isRoot,
            ...(tmbInfo ? { tmbInfo } : {})
          });
          if (String(authorized.app.teamId) !== (targetTeamId ?? tmbInfo?.teamId)) {
            throw AppErrEnum.unAuthApp;
          }
          return;
        }
        if (resource.type === 'dataset') {
          if (!Types.ObjectId.isValid(resource.id)) {
            return { resource, error: DatasetErrEnum.unExist };
          }
          const tmbInfo = await getTmbInfo();
          const authorized = await authDatasetByTmbId({
            datasetId: resource.id,
            tmbId,
            per: ReadPermissionVal,
            isRoot,
            ...(tmbInfo ? { tmbInfo } : {})
          });
          if (String(authorized.dataset.teamId) !== (targetTeamId ?? tmbInfo?.teamId)) {
            throw DatasetErrEnum.unAuthDataset;
          }
          return;
        }
        if (resource.type === 'skill') {
          if (!Types.ObjectId.isValid(resource.id)) {
            return { resource, error: SkillErrEnum.unExist };
          }
          const tmbInfo = await getTmbInfo();
          const authorized = await authSkillByTmbId({
            skillId: resource.id,
            tmbId,
            per: ReadPermissionVal,
            isRoot,
            ...(tmbInfo ? { tmbInfo } : {})
          });
          if (
            authorized.skill.source !== AgentSkillSourceEnum.system &&
            String(authorized.skill.teamId) !== (targetTeamId ?? tmbInfo?.teamId)
          ) {
            throw SkillErrEnum.unAuthSkill;
          }
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
  teamId,
  isRoot = false,
  modelHandle
}: {
  resources: AppResource[];
  tmbId: unknown;
  teamId?: string;
  isRoot?: boolean;
  modelHandle?: ModelHandle;
}): Promise<AppResource[]> => {
  if (resources.length === 0) return [];

  const validTmbId = typeof tmbId === 'string' && tmbId.length > 0 ? tmbId : String(tmbId ?? '');
  if (!validTmbId || !Types.ObjectId.isValid(validTmbId)) {
    return [];
  }

  let tmbInfo: Pick<TeamTmbItemType, 'teamId' | 'permission'> | undefined;
  try {
    tmbInfo = await getTmbInfoByTmbId({ tmbId: validTmbId });
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
    teamId,
    isRoot,
    modelHandle,
    tmbInfo
  });
  if (unauthorized.length === 0) return resources;

  const unauthorizedKeys = new Set(unauthorized.map((item) => getAppResourceKey(item.resource)));
  return resources.filter((resource) => !unauthorizedKeys.has(getAppResourceKey(resource)));
};
