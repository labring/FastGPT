import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { SkillErrEnum } from '@fastgpt/global/common/error/code/skill';
import { isModelConfigError } from '@fastgpt/global/common/error/model';
import { UserError } from '@fastgpt/global/common/error/utils';
import type { AIModelDataType } from '@fastgpt/global/core/ai/model/schema';
import { AgentSkillSourceEnum } from '@fastgpt/global/core/ai/skill/constants';
import type { AppResourceType } from '@fastgpt/global/core/app/type';
import type { WorkflowResourceContext } from '@fastgpt/global/core/workflow/runtime/type';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import mongoose, { Types } from '../../../common/mongo';
import { authAppByTmbId } from '../../../support/permission/app/auth';
import { authDatasetByTmbId } from '../../../support/permission/dataset/auth';
import { assertAuthModels } from '../../../support/permission/model/auth';
import { authSkillByTmbId } from '../../../support/permission/skill/auth';
import type { ModelHandle } from '../../ai/model/catalog/handle';
import { getTeamModelHandle } from '../../ai/model/catalog/service';
import { MongoAgentSkills } from '../../ai/skill/model/schema';
import { MongoApp } from '../../app/schema';
import { getAppVersionById } from '../../app/version/controller';
import { MongoDataset } from '../../dataset/schema';
import { getWorkflowResourceContext } from '../utils/context';
import { hasWorkflowResource, createWorkflowResourceContext } from './context';

/** 静态资源快照实体不可用错误；不能被工具加载器降级为单个工具不可用。 */
export class WorkflowResourceError extends UserError {}

export const isWorkflowResourceError = (error: unknown): error is WorkflowResourceError =>
  error instanceof WorkflowResourceError;

/** 普通工作流的快照资源限定所属团队；系统工具和 root 调试允许按 ID 读取。 */
const getSnapshotTeamFilter = (context: WorkflowResourceContext) =>
  context.teamId && !context.isRoot ? { teamId: context.teamId } : {};

export type WorkflowResourceUserInfo = {
  teamId: string;
  tmbId: string;
};

type LoadWorkflowModelBaseParams = {
  /** 应用或工具所属团队 ID，用于读取工作流静态模型目录。 */
  appTeamId: string;
  /** 当前运行人身份，未命中资源快照时按运行人所属团队与成员 ID 鉴权。 */
  userInfo: WorkflowResourceUserInfo;
  modelId?: string;
  model?: string;
  modelHandle?: ModelHandle;
};

/**
 * 在节点执行点加载并校验模型资源。
 *
 * 1. 先通过 `ModelHandle.getModelData` 解析模型对象，保持缺失、停用、类型不符等 `ModelConfigError` 语义；
 * 2. 若 `modelId` 命中当前 `WorkflowResourceContext` 快照，按 `appTeamId` 目录直接放行；
 * 3. 未命中快照（或无上下文）时，使用运行人 `userInfo`（`userInfo.teamId` + `userInfo.tmbId`）及对应团队目录执行 `use` 权限校验（`assertAuthModels`）；
 * 4. 仅含 legacy `model`（无 `modelId`）的历史节点仅在系统模型目录内解析，不做快照或成员 ACL 校验；
 * 5. `fallbackToDefault: true` 时（如知识库重排/问题优化辅助模型），仅对 `ModelConfigError` 回退系统默认模型，权限错误不降级。
 */
export const loadWorkflowModelResource = async <
  T extends 'llm' | 'rerank' = 'llm',
  Fallback extends boolean = false
>({
  appTeamId,
  userInfo,
  modelId,
  model,
  type = 'llm' as T,
  fallbackToDefault = false as Fallback,
  modelHandle
}: LoadWorkflowModelBaseParams & {
  type?: T;
  fallbackToDefault?: Fallback;
}): Promise<
  Fallback extends true
    ? Extract<AIModelDataType, { type: T }> | undefined
    : Extract<AIModelDataType, { type: T }>
> => {
  type Result = Fallback extends true
    ? Extract<AIModelDataType, { type: T }> | undefined
    : Extract<AIModelDataType, { type: T }>;
  const appHandle = modelHandle ?? (await getTeamModelHandle({ teamId: appTeamId }));

  try {
    const id = typeof modelId === 'string' ? modelId.trim() : '';
    const context = getWorkflowResourceContext();
    const isSnapshotAuthorized = !id || hasWorkflowResource({ context, type: 'model', id });
    const authHandle =
      isSnapshotAuthorized || !userInfo.teamId || userInfo.teamId === appTeamId
        ? appHandle
        : await getTeamModelHandle({ teamId: userInfo.teamId });
    // 跨团队未命中快照时，若模型在运行人团队目录中存在则优先从运行人目录解析；
    // 否则在应用目录解析以保留已删除/停用等 ModelConfigError 语义，再由 assertAuthModels 阻断无权限访问。
    const resolveHandle =
      authHandle !== appHandle && authHandle.findModelData?.({ modelId: id })
        ? authHandle
        : appHandle;
    const modelData = resolveHandle.getModelData({ modelId, model }, { type });

    if (!isSnapshotAuthorized) {
      await assertAuthModels({
        actor: {
          teamId: userInfo.teamId,
          tmbId: userInfo.tmbId,
          isRoot: context?.isRoot ?? false
        },
        modelIds: [id],
        action: 'use',
        handle: authHandle
      });
    }

    return modelData as Result;
  } catch (error) {
    if (!fallbackToDefault || !isModelConfigError(error)) {
      throw error;
    }

    try {
      return appHandle.getDefaultModelData(type) as Result;
    } catch (fallbackError) {
      if (!isModelConfigError(fallbackError)) {
        throw fallbackError;
      }
      return undefined as Result;
    }
  }
};

/**
 * 读取工作流使用的知识库。
 * 命中当前 Version 快照的知识库直接实时查询数据库；未命中快照（或无 resourceContext）的知识库统一按运行人 tmbId 鉴权。
 */
export const loadWorkflowDatasetResource = async ({
  datasetId,
  datasetIds = [datasetId],
  tmbId
}: {
  datasetId: string;
  /** 工作流可能一次使用多个知识库，加载首个实体前需要完整校验未命中快照的知识库权限。 */
  datasetIds?: string[];
  tmbId?: string;
}) => {
  const context = getWorkflowResourceContext();
  const allDatasetIds = Array.from(new Set([datasetId, ...datasetIds]));
  // 先检查全部未命中项的权限；只需要首个实体来确定检索使用的向量模型。
  const uncheckedDatasetIds = allDatasetIds.filter(
    (id) => !hasWorkflowResource({ context, type: 'dataset', id })
  );
  const authorizedDatasets = await Promise.all(
    uncheckedDatasetIds.map(async (id) => {
      if (!tmbId) throw DatasetErrEnum.unExist;
      return (
        await authDatasetByTmbId({
          tmbId,
          datasetId: id,
          per: ReadPermissionVal,
          ...(context?.isRoot ? { isRoot: true } : {})
        })
      ).dataset;
    })
  );
  const firstIndex = uncheckedDatasetIds.indexOf(datasetId);
  if (firstIndex !== -1) return authorizedDatasets[firstIndex];

  let dataset = null;
  try {
    dataset = await MongoDataset.findOne({
      _id: datasetId,
      deleteTime: null,
      ...(context ? getSnapshotTeamFilter(context) : {})
    }).lean();
  } catch (error) {
    if (!(error instanceof mongoose.Error.CastError)) throw error;
    throw DatasetErrEnum.unExist;
  }
  if (!dataset) throw DatasetErrEnum.unExist;
  return dataset;
};

/**
 * 加载 App 或工具集。
 * 命中当前 Version 快照时实时查询数据库；未命中快照或没有 resourceContext 时按运行人读权限查询。
 */
export const loadWorkflowAppResource = async ({
  appId,
  tmbId,
  type,
  toolName
}: {
  appId: string;
  tmbId: string;
  type: Extract<AppResourceType, 'agent' | 'tool'>;
  toolName?: string;
}) => {
  const context = getWorkflowResourceContext();
  if (!hasWorkflowResource({ context, type, id: appId, toolName })) {
    return (
      await authAppByTmbId({
        appId,
        tmbId,
        per: ReadPermissionVal,
        ...(context?.isRoot ? { isRoot: true } : {})
      })
    ).app;
  }

  let app = null;
  try {
    app = await MongoApp.findOne({
      _id: appId,
      deleteTime: null,
      ...(context ? getSnapshotTeamFilter(context) : {})
    }).lean();
  } catch (error) {
    if (!(error instanceof mongoose.Error.CastError)) throw error;
    throw new WorkflowResourceError(`App resource is unavailable: ${type}:${appId}`);
  }
  if (!app) throw new WorkflowResourceError(`App resource is unavailable: ${type}:${appId}`);
  return app;
};

/**
 * 加载工作流使用的 Skill 列表：
 * 命中当前版本快照的 Skill 直接从数据库加载（缺失或团队不匹配抛 `SkillErrEnum.unExist`）；
 * 未命中快照的 Skill 回退到运行人 `tmbId` 读权限校验（无权限或不存在时返回 `null` 由上层跳过）。
 */
export const loadWorkflowSkillResources = async ({
  skillIds,
  tmbId
}: {
  skillIds: string[];
  tmbId: string;
}) => {
  const context = getWorkflowResourceContext();
  const uniqueIds = Array.from(new Set(skillIds));
  const resolved = await Promise.all(
    uniqueIds.map(async (skillId) => {
      const fromSnapshot = hasWorkflowResource({ context, type: 'skill', id: skillId });
      if (!Types.ObjectId.isValid(skillId)) {
        if (fromSnapshot) throw SkillErrEnum.unExist;
        return null;
      }

      if (fromSnapshot) {
        const skill = await MongoAgentSkills.findOne({
          _id: skillId,
          deleteTime: null,
          ...(context?.teamId && !context.isRoot
            ? { $or: [{ teamId: context.teamId }, { source: AgentSkillSourceEnum.system }] }
            : {})
        }).lean();
        if (!skill) throw SkillErrEnum.unExist;
        return skill;
      }

      try {
        return (
          await authSkillByTmbId({
            tmbId,
            skillId,
            per: ReadPermissionVal,
            isRoot: context?.isRoot ?? false
          })
        ).skill;
      } catch (error) {
        if (error !== SkillErrEnum.unAuthSkill && error !== SkillErrEnum.unExist) throw error;
        return null;
      }
    })
  );

  return resolved.filter((skill): skill is NonNullable<typeof skill> => !!skill);
};

/**
 * 加载子应用/插件工作流及其独立资源快照上下文。
 * 封装“校验应用 -> 加载版本 -> 初始化子快照上下文”流程。
 */
export const loadChildWorkflowWithResource = async ({
  appId,
  versionId,
  tmbId,
  type,
  toolName,
  appTeamId,
  teamId
}: {
  appId: string;
  versionId?: string;
  tmbId: string;
  type: Extract<AppResourceType, 'agent' | 'tool'>;
  toolName?: string;
  appTeamId?: string;
  teamId?: string;
}) => {
  const appData = await loadWorkflowAppResource({
    appId,
    tmbId,
    type,
    toolName
  });
  const childVersion = await getAppVersionById({
    appId,
    versionId,
    app: appData
  });
  const resourceContext = createWorkflowResourceContext({
    resources: childVersion.resources,
    teamId: appTeamId ?? teamId ?? String(appData.teamId)
  });

  return {
    appData,
    childVersion,
    resourceContext
  };
};
