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

const normalizeModelIds = (modelIds?: string | Array<string | undefined | null>) => {
  if (!modelIds) return [];
  const ids = Array.isArray(modelIds) ? modelIds : [modelIds];
  return [...new Set(ids.filter((id): id is string => typeof id === 'string' && !!id))];
};

export const authModelByTmbId = async ({
  tmbId,
  modelId,
  per,
  isRoot
}: {
  tmbId: string;
  modelId: string;
  per: PermissionValueType;
  isRoot?: boolean;
}): Promise<{
  model: SystemModelItemType & {
    permission: ModelPermission;
  };
}> => {
  const tmb = await getTmbInfoByTmbId({ tmbId });
  const model = getModelById(modelId);

  if (!model) {
    return Promise.reject(`Model not found: ${modelId}`);
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
  ...props
}: AuthModeType & {
  modelId: string;
  per: PermissionValueType;
}): Promise<
  AuthResponseType<ModelPermission> & {
    model: SystemModelItemType & {
      permission: ModelPermission;
    };
  }
> => {
  const result = await parseHeaderCert(props);

  if (!modelId) {
    return Promise.reject('Model not found: modelId is empty');
  }

  const { model } = await authModelByTmbId({
    tmbId: result.tmbId,
    modelId,
    per,
    isRoot: result.isRoot
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
    throw new Error('Model not active');
  }

  if (type && model.type !== type) {
    throw new Error('Model type not supported');
  }

  if (requireVision && (!('vision' in model) || model.vision !== true)) {
    throw new Error('Model type not supported');
  }
};

export const authModels = async ({
  modelIds,
  per = ReadPermissionVal,
  ...props
}: AuthModeType & {
  modelIds?: string | Array<string | undefined | null>;
  per?: PermissionValueType;
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
    const missingIds = ids.filter((id, i) => !models[i]);
    return Promise.reject(`Model not found: ${missingIds.join(', ')}`);
  }

  const tmb = await getTmbInfoByTmbId({ tmbId: result.tmbId });
  const modelsWithPermission = await Promise.all(
    (models as SystemModelItemType[]).map(async (model) => {
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
