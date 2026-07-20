import { ModelPermission } from '@fastgpt/global/support/permission/model/controller';
import {
  PerResourceTypeEnum,
  ReadRoleVal,
  ReadPermissionVal,
  NullRoleVal
} from '@fastgpt/global/support/permission/constant';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { getTmbInfoByTmbId } from '../../user/team/controller';
import { getTmbPermission } from '../controller';
import type { PermissionValueType } from '@fastgpt/global/support/permission/type';
import type { AuthModeType, AuthResponseType } from '../type';
import { parseHeaderCert } from '../auth/common';
import { getModelById } from '../../../core/ai/model/cache';
import type { SystemModelItemType } from '../../../core/ai/model/type';
import { getDatasetModelIds } from '../../../core/dataset/utils';
import { MongoApp } from '../../../core/app/schema';
import { MongoDataset } from '../../../core/dataset/schema';
import { extractWorkflowModelIds } from '@fastgpt/global/core/workflow/utils';
import { authAppByTmbId } from '../app/auth';
import { authDatasetByTmbId } from '../dataset/auth';

export type ResourceContextType = { appId: string } | { datasetId: string };

export const getModelPermission = async ({
  modelData,
  teamId,
  tmbId,
  isRoot
}: {
  modelData: SystemModelItemType;
  teamId: string;
  tmbId: string;
  isRoot?: boolean;
}): Promise<ModelPermission> => {
  // Root user has full permissions
  if (isRoot) {
    return new ModelPermission({ isOwner: true });
  }

  // System models are read-only platform-wide
  if (modelData.isSystem) {
    return new ModelPermission({ role: ReadRoleVal });
  }

  // Only the creator has full permissions — team owners do NOT get owner rights
  // over other members' models (user ruling 2026-08; root sees everything via admin).
  const isOwner = modelData.tmbId !== undefined && String(modelData.tmbId) === tmbId;
  if (isOwner) {
    return new ModelPermission({ isOwner: true });
  }

  // Models from a different team are not accessible
  if (modelData.teamId !== undefined && String(modelData.teamId) !== teamId) {
    return new ModelPermission({ role: NullRoleVal });
  }

  // Check collaborator permissions
  const myPer = await getTmbPermission({
    teamId,
    tmbId,
    resourceType: PerResourceTypeEnum.model,
    resourceId: modelData.id
  });

  return new ModelPermission({ role: myPer ?? NullRoleVal });
};

/**
 * Bypass direct model permission via resource context.
 * When a model is already referenced by an app/dataset the user can read,
 * access to the model is implied (design §2.2).
 */
export const checkModelAccessThroughResource = async ({
  modelId,
  teamId,
  tmbId,
  isRoot,
  resourceContext
}: {
  modelId: string;
  teamId: string;
  tmbId: string;
  isRoot?: boolean;
  resourceContext: ResourceContextType;
}): Promise<boolean> => {
  try {
    if ('appId' in resourceContext) {
      const app = await MongoApp.findById(
        resourceContext.appId,
        'modules chatConfig tmbId teamId'
      ).lean();
      if (!app) return false;

      const existingModelIds = extractWorkflowModelIds({
        modules: app.modules,
        chatConfig: app.chatConfig
      });
      if (!existingModelIds.includes(modelId)) return false;

      await authAppByTmbId({
        tmbId,
        appId: resourceContext.appId,
        per: ReadPermissionVal,
        isRoot
      });
      return true;
    }

    if ('datasetId' in resourceContext) {
      const dataset = await MongoDataset.findById(
        resourceContext.datasetId,
        'vectorModelId vectorModel agentModelId agentModel vlmModelId vlmModel tmbId teamId'
      ).lean();
      if (!dataset) return false;

      // ⚠️ 热升级兼容：legacy-only dataset 只有 provider 模型名，同步收集进鉴权集合
      const { vectorModelId, agentModelId, vlmModelId } = getDatasetModelIds(dataset);
      const existingModelIds = [vectorModelId, agentModelId, vlmModelId].filter(
        (id): id is string => typeof id === 'string' && !!id
      );

      if (!existingModelIds.includes(modelId)) return false;

      await authDatasetByTmbId({
        tmbId,
        datasetId: resourceContext.datasetId,
        per: ReadPermissionVal,
        isRoot
      });
      return true;
    }

    return false;
  } catch {
    return false;
  }
};

export const authModelByTmbId = async ({
  tmbId,
  modelId,
  per,
  isRoot = false,
  resourceContext
}: {
  tmbId: string;
  modelId: string;
  per: PermissionValueType;
  isRoot?: boolean;
  resourceContext?: ResourceContextType;
}): Promise<{
  modelData: SystemModelItemType & { permission: ModelPermission };
}> => {
  const modelData = await (async () => {
    const [{ teamId }, modelData] = await Promise.all([
      getTmbInfoByTmbId({ tmbId }),
      (async () => {
        const m = getModelById(modelId);
        if (!m) return Promise.reject(ModelErrEnum.unExist);
        return m;
      })()
    ]);

    // Resource-context bypass: model already used by an app/dataset the user can read
    if (resourceContext) {
      const canBypass = await checkModelAccessThroughResource({
        modelId,
        teamId,
        tmbId,
        isRoot,
        resourceContext
      });
      if (canBypass) {
        return {
          ...modelData,
          permission: new ModelPermission({ isOwner: false, role: ReadRoleVal })
        };
      }
    }

    const permission = await getModelPermission({
      modelData,
      teamId,
      tmbId,
      isRoot
    });

    if (!permission.checkPer(per)) {
      return Promise.reject(ModelErrEnum.unAuthModel);
    }

    return {
      ...modelData,
      permission
    };
  })();

  return { modelData };
};

export const authModel = async ({
  modelId,
  per,
  resourceContext,
  ...props
}: AuthModeType & {
  modelId: string;
  per: PermissionValueType;
  resourceContext?: ResourceContextType;
}): Promise<
  AuthResponseType<ModelPermission> & {
    modelData: SystemModelItemType & { permission: ModelPermission };
  }
> => {
  const result = await parseHeaderCert(props);

  if (!modelId) {
    return Promise.reject(ModelErrEnum.invalidModelId);
  }

  const { modelData } = await authModelByTmbId({
    tmbId: result.tmbId,
    modelId,
    per,
    isRoot: result.isRoot,
    resourceContext
  });

  return {
    ...result,
    permission: modelData.permission,
    modelData
  };
};

/* ═══ Batch auth (Module 11) ═══ */

/** Flatten, deduplicate and filter empty modelIds. */
export const normalizeModelIds = (
  modelIds?: string | Array<string | undefined | null>
): string[] => {
  const list = Array.isArray(modelIds) ? modelIds : [modelIds];
  return [...new Set(list.filter((id): id is string => typeof id === 'string' && !!id))];
};

/**
 * Batch model auth for workflow nodes / dataset fields — header-less variant,
 * takes an already-authenticated identity (runtime dispatch path).
 * Empty list returns empty result; any unauthorized model rejects the batch.
 */
export const authModelsByTmbId = async ({
  tmbId,
  teamId,
  isRoot = false,
  modelIds,
  per = ReadPermissionVal,
  resourceContext
}: {
  tmbId: string;
  teamId?: string;
  isRoot?: boolean;
  modelIds?: string | Array<string | undefined | null>;
  per?: PermissionValueType;
  resourceContext?: ResourceContextType;
}): Promise<{
  permission: ModelPermission;
  models: (SystemModelItemType & { permission: ModelPermission })[];
}> => {
  const ids = normalizeModelIds(modelIds);

  if (ids.length === 0) {
    return {
      permission: new ModelPermission(),
      models: []
    };
  }

  const models = ids.map((id) => getModelById(id));

  if (models.some((modelData) => !modelData)) {
    return Promise.reject(ModelErrEnum.unExist);
  }

  // Callers usually already know the team (runtime dispatch) — only fall back
  // to a lookup when it was not provided.
  const resolvedTeamId = teamId ?? (await getTmbInfoByTmbId({ tmbId })).teamId;
  const modelsWithPermission = await Promise.all(
    (models as SystemModelItemType[]).map(async (modelData) => {
      if (resourceContext) {
        const canBypass = await checkModelAccessThroughResource({
          modelId: modelData.id,
          teamId: resolvedTeamId,
          tmbId,
          isRoot,
          resourceContext
        });
        if (canBypass) {
          return {
            ...modelData,
            permission: new ModelPermission({ isOwner: false, role: ReadPermissionVal })
          };
        }
      }

      const permission = await getModelPermission({
        modelData,
        teamId: resolvedTeamId,
        tmbId,
        isRoot
      });

      if (!permission.checkPer(per)) {
        return Promise.reject(ModelErrEnum.unAuthModel);
      }

      return {
        ...modelData,
        permission
      };
    })
  );

  return {
    permission: modelsWithPermission[0]?.permission ?? new ModelPermission(),
    models: modelsWithPermission
  };
};

/**
 * Batch model auth for workflow nodes / dataset fields (API entry, header-based).
 * Empty list returns empty result; any unauthorized model rejects the batch.
 */
export const authModels = async ({
  modelIds,
  per = ReadPermissionVal,
  resourceContext,
  ...props
}: AuthModeType & {
  modelIds?: string | Array<string | undefined | null>;
  per?: PermissionValueType;
  resourceContext?: ResourceContextType;
}): Promise<
  AuthResponseType<ModelPermission> & {
    models: (SystemModelItemType & { permission: ModelPermission })[];
  }
> => {
  const result = await parseHeaderCert(props);

  const { models } = await authModelsByTmbId({
    tmbId: result.tmbId,
    isRoot: result.isRoot,
    modelIds,
    per,
    resourceContext
  });

  return {
    ...result,
    permission: models[0]?.permission ?? new ModelPermission(),
    models
  };
};
