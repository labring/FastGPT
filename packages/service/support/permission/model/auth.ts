import { getModelById } from '../../../core/ai/model';
import type { SystemModelItemType } from '../../../core/ai/type';
import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import type { PermissionValueType } from '@fastgpt/global/support/permission/type';
import { ModelPermission } from '@fastgpt/global/support/permission/model/controller';
import { getTmbInfoByTmbId } from '../../user/team/controller';
import { parseHeaderCert } from '../auth/common';
import type { AuthModeType, AuthResponseType } from '../type';
import { getModelPermission } from './controller';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import type { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { MongoApp } from '../../../core/app/schema';
import { MongoDataset } from '../../../core/dataset/schema';
import { extractWorkflowModelIds } from '@fastgpt/global/core/workflow/utils';
import { authAppByTmbId } from '../app/auth';
import { authDatasetByTmbId } from '../dataset/auth';

const normalizeModelIds = (modelIds?: string | Array<string | undefined | null>) => {
  if (!modelIds) return [];
  const ids = Array.isArray(modelIds) ? modelIds : [modelIds];
  return [...new Set(ids.filter((id): id is string => typeof id === 'string' && !!id))];
};

/**
 * Check if the user can access a model through a resource (app or dataset) context.
 * When a model is already configured in an app/dataset that the user has access to,
 * the user can use that model without having direct permission on it.
 */
const checkModelAccessThroughResource = async ({
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
  resourceContext: { appId: string } | { datasetId: string };
}): Promise<boolean> => {
  try {
    if ('appId' in resourceContext) {
      // Load the app and extract its current model IDs
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

      // Check if the user has read permission on the app
      await authAppByTmbId({
        tmbId,
        appId: resourceContext.appId,
        per: ReadPermissionVal,
        isRoot
      });
      return true;
    }

    if ('datasetId' in resourceContext) {
      // Load the dataset and check its model IDs
      const dataset = await MongoDataset.findById(
        resourceContext.datasetId,
        'vectorModelId agentModelId vlmModelId tmbId teamId'
      ).lean();
      if (!dataset) return false;

      const existingModelIds = [
        dataset.vectorModelId,
        dataset.agentModelId,
        dataset.vlmModelId
      ].filter((id): id is string => typeof id === 'string' && !!id);

      if (!existingModelIds.includes(modelId)) return false;

      // Check if the user has read permission on the dataset
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
  isRoot,
  resourceContext
}: {
  tmbId: string;
  modelId: string;
  per: PermissionValueType;
  isRoot?: boolean;
  resourceContext?: { appId: string } | { datasetId: string };
}): Promise<{
  model: SystemModelItemType & {
    permission: ModelPermission;
  };
}> => {
  const tmb = await getTmbInfoByTmbId({ tmbId });
  const model = getModelById(modelId);

  if (!model) {
    return Promise.reject(ModelErrEnum.unExist);
  }

  // If resourceContext is provided, check if the model can be accessed through the resource
  if (resourceContext) {
    const canBypass = await checkModelAccessThroughResource({
      modelId,
      teamId: tmb.teamId,
      tmbId,
      isRoot,
      resourceContext
    });
    if (canBypass) {
      return {
        model: {
          ...model,
          permission: new ModelPermission({ isOwner: false, role: ReadPermissionVal })
        }
      };
    }
  }

  const permission = await getModelPermission({
    model,
    teamId: tmb.teamId,
    tmbId,
    isRoot,
    teamPer: tmb.permission
  });

  if (!permission.checkPer(per)) {
    return Promise.reject(ERROR_ENUM.unAuthModel);
  }

  return {
    model: {
      ...model,
      permission
    }
  };
};

export const authModel = async ({
  modelId,
  per,
  resourceContext,
  ...props
}: AuthModeType & {
  modelId: string;
  per: PermissionValueType;
  resourceContext?: { appId: string } | { datasetId: string };
}): Promise<
  AuthResponseType<ModelPermission> & {
    model: SystemModelItemType & {
      permission: ModelPermission;
    };
  }
> => {
  const result = await parseHeaderCert(props);

  if (!modelId) {
    return Promise.reject(ModelErrEnum.invalidModelId);
  }

  const { model } = await authModelByTmbId({
    tmbId: result.tmbId,
    modelId,
    per,
    isRoot: result.isRoot,
    resourceContext
  });

  return {
    ...result,
    permission: model.permission,
    model
  };
};

export const assertModelAvailable = (
  model: SystemModelItemType,
  {
    type,
    requireVision = false
  }: {
    type?: `${ModelTypeEnum}`;
    requireVision?: boolean;
  } = {}
) => {
  if (!model.isActive) {
    throw new Error(ModelErrEnum.modelNotActive);
  }

  if (type && model.type !== type) {
    throw new Error(ModelErrEnum.modelTypeNotSupported);
  }

  if (requireVision && (!('vision' in model) || model.vision !== true)) {
    throw new Error(ModelErrEnum.modelTypeNotSupported);
  }
};

export const authModels = async ({
  modelIds,
  per = ReadPermissionVal,
  resourceContext,
  ...props
}: AuthModeType & {
  modelIds?: string | Array<string | undefined | null>;
  per?: PermissionValueType;
  resourceContext?: { appId: string } | { datasetId: string };
}): Promise<
  AuthResponseType<ModelPermission> & {
    models: (SystemModelItemType & {
      permission: ModelPermission;
    })[];
  }
> => {
  const result = await parseHeaderCert(props);
  const ids = normalizeModelIds(modelIds);

  if (ids.length === 0) {
    return {
      ...result,
      permission: new ModelPermission(),
      models: []
    };
  }

  const models = ids.map((id) => getModelById(id));

  if (models.some((model) => !model)) {
    return Promise.reject(ModelErrEnum.unExist);
  }

  const tmb = await getTmbInfoByTmbId({ tmbId: result.tmbId });
  const modelsWithPermission = await Promise.all(
    (models as SystemModelItemType[]).map(async (model) => {
      // Check if this specific model can be accessed through the resource context
      if (resourceContext) {
        const canBypass = await checkModelAccessThroughResource({
          modelId: model.id,
          teamId: tmb.teamId,
          tmbId: result.tmbId,
          isRoot: result.isRoot,
          resourceContext
        });
        if (canBypass) {
          return {
            ...model,
            permission: new ModelPermission({ isOwner: false, role: ReadPermissionVal })
          };
        }
      }

      const permission = await getModelPermission({
        model,
        teamId: tmb.teamId,
        tmbId: result.tmbId,
        isRoot: result.isRoot,
        teamPer: tmb.permission
      });

      if (!permission.checkPer(per)) {
        return Promise.reject(ERROR_ENUM.unAuthModel);
      }

      return {
        ...model,
        permission
      };
    })
  );

  return {
    ...result,
    permission: modelsWithPermission[0]?.permission ?? new ModelPermission(),
    models: modelsWithPermission
  };
};
