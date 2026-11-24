import {
  AppResourcesSchema,
  type AppResourcesType,
  type AppChatConfigType,
  type AppResource
} from '@fastgpt/global/core/app/type';
import type { AppVersionSchemaType } from '@fastgpt/global/core/app/version/type';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { UserError } from '@fastgpt/global/common/error/utils';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { jsonSchema2NodeInput } from '@fastgpt/global/core/app/jsonschema';
import { AgentToolInputModeEnum, AppToolSourceEnum } from '@fastgpt/global/core/app/tool/constants';
import {
  getTeamPluginSource,
  isDebugToolSource,
  isTeamPluginSource,
  splitCombineToolId
} from '@fastgpt/global/core/app/tool/utils';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { AuthUserTypeEnum } from '@fastgpt/global/support/permission/constant';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import { formatModels, isWorkflowModelExpression } from '@fastgpt/global/common/workflow/model';
import {
  getSelectedInputRenderType,
  nodeInputIsReference
} from '@fastgpt/global/common/workflow/reference';
import type { ClientSession } from '../../../common/mongo';
import type { ModelHandle } from '../../ai/model/catalog/handle';
import { getSystemModelHandle, getTeamModelHandle } from '../../ai/model/catalog/service';
import { assertAuthModels, getAuthorizedModelIds } from '../../../support/permission/model/auth';
import {
  filterAuthorizedAppResources,
  checkAppResourceReadPermissions,
  getAppResourcesOutsideTeam
} from '../../../support/permission/app/resource';
import { getTmbInfoByTmbId } from '../../../support/user/team/controller';
import { SystemToolRepo } from '../tool/systemTool/systemTool.repo';
import { MongoApp } from '../schema';
import { getAppDraftVersion, getAppLatestVersion } from '../version/controller';
import { decodeToolSetNodesFromStorage } from '../jsonSchemaStorage';
import {
  extractAppResources,
  getAppResourceKey,
  hasAppResource,
  mergeAppResources,
  splitExtractedAppResources,
  resolveStoredAppResources
} from './utils';

const isPlainObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * 从 Agent 节点的 `selectedTools[*].config` 中提取系统/商业工具声明的 `selectLLMModel` 模型引用。
 *
 * `migrateWorkflowToCurrent()` 会将 `selectedTools[*].inputs` 归一为 `{ key, mode }` 稀疏结构并移除
 * `renderTypeList`，因此需要通过 `SystemToolRepo` 读取工具真实 schema，识别 `selectLLMModel` 输入键
 * 并仅提取未设为 `agentGenerated` 的手工模型配置，确保：
 * 1. 发布/调试时受 `resolveAppResourcesByPermission` 权限校验约束（防止无权限编辑者夹带未授权模型）；
 * 2. 合法模型写入 `AppVersion.resources`，让已发布应用及 `model:invoke` 反向调用准确继承发布者快照授权。
 */
export const extractSelectedToolModelResources = async ({
  nodes = [],
  teamId,
  modelHandle,
  ignoreToolDetailError = false
}: {
  nodes?: Array<StoreNodeItemType | RuntimeNodeItemType>;
  teamId?: string;
  modelHandle?: ModelHandle;
  /** 仅用于历史无 resources 字段草稿的兼容回填；发布/创建等强校验流程必须保持 false，避免读取失败时静默产出残缺快照。 */
  ignoreToolDetailError?: boolean;
}): Promise<AppResourcesType> => {
  const candidates: Array<{
    toolId: string;
    detailSource: string;
    version?: string;
    config: Record<string, unknown>;
    inputs: unknown;
  }> = [];

  for (const node of nodes) {
    if (node.flowNodeType !== FlowNodeTypeEnum.agent) continue;

    for (const input of node.inputs ?? []) {
      if (input.key !== NodeInputKeyEnum.selectedTools || nodeInputIsReference(input)) continue;
      if (!Array.isArray(input.value)) continue;

      for (const tool of input.value) {
        if (!isPlainObjectRecord(tool) || !isPlainObjectRecord(tool.config)) continue;
        if (Object.keys(tool.config).length === 0) continue;

        const rawToolId =
          typeof tool.id === 'string' && tool.id.trim()
            ? tool.id.trim()
            : typeof tool.toolId === 'string' && tool.toolId.trim()
              ? tool.toolId.trim()
              : '';
        if (!rawToolId) continue;

        let idSource: string;
        try {
          idSource = splitCombineToolId(rawToolId).source;
        } catch {
          continue;
        }

        if (
          idSource !== AppToolSourceEnum.systemTool &&
          idSource !== AppToolSourceEnum.commercial
        ) {
          continue;
        }

        const toolConfig = isPlainObjectRecord(tool.toolConfig) ? tool.toolConfig : undefined;
        const systemToolConfig =
          toolConfig && isPlainObjectRecord(toolConfig.systemTool)
            ? toolConfig.systemTool
            : undefined;
        const systemToolSetConfig =
          toolConfig && isPlainObjectRecord(toolConfig.systemToolSet)
            ? toolConfig.systemToolSet
            : undefined;
        const rawSource =
          typeof tool.source === 'string'
            ? tool.source
            : typeof systemToolConfig?.source === 'string'
              ? systemToolConfig.source
              : typeof systemToolSetConfig?.source === 'string'
                ? systemToolSetConfig.source
                : undefined;

        let detailSource: string;
        if (isDebugToolSource(rawSource)) {
          detailSource = rawSource;
        } else if (isTeamPluginSource(rawSource)) {
          if (teamId && rawSource !== getTeamPluginSource(teamId)) continue;
          detailSource = rawSource;
        } else {
          detailSource = idSource === AppToolSourceEnum.commercial ? idSource : 'system';
        }

        const version =
          typeof tool.version === 'string' && tool.version
            ? tool.version
            : typeof tool.versionId === 'string' && tool.versionId
              ? tool.versionId
              : undefined;

        candidates.push({
          toolId: rawToolId,
          detailSource,
          version,
          config: tool.config,
          inputs: tool.inputs
        });
      }
    }
  }

  if (candidates.length === 0) return [];

  const systemToolRepo = SystemToolRepo.getInstance();
  const detailPromiseCache = new Map<
    string,
    Promise<Awaited<ReturnType<typeof systemToolRepo.getSystemToolDetail>> | null>
  >();
  const getToolDetail = (toolId: string, detailSource: string, version?: string) => {
    const cacheKey = `${detailSource}:${toolId}:${version ?? ''}`;
    let pending = detailPromiseCache.get(cacheKey);
    if (!pending) {
      const request = systemToolRepo.getSystemToolDetail({
        pluginId: toolId,
        source: detailSource,
        version,
        fallbackLatestVersion: true
      });
      pending = ignoreToolDetailError ? request.catch(() => null) : request;
      detailPromiseCache.set(cacheKey, pending);
    }
    return pending;
  };

  const resolveHandle: ModelHandle | undefined =
    modelHandle ??
    (teamId
      ? await getTeamModelHandle({ teamId }).catch(() => undefined)
      : typeof getSystemModelHandle === 'function'
        ? await getSystemModelHandle().catch(() => undefined)
        : undefined);
  const findModelIdByHandle = (value: string): string | undefined => {
    if (!resolveHandle) return undefined;
    if (typeof resolveHandle.findModelData === 'function') {
      return (
        resolveHandle.findModelData({ modelId: value })?.modelId ??
        resolveHandle.findModelData({ model: value }, { type: ModelTypeEnum.llm })?.modelId
      );
    }
    return undefined;
  };
  const resources: AppResource[] = [];

  await Promise.all(
    candidates.map(async (candidate) => {
      const toolDetail = await getToolDetail(
        candidate.toolId,
        candidate.detailSource,
        candidate.version
      );
      if (!toolDetail) return;

      const schemas = [
        toolDetail.inputSchema,
        ...(toolDetail.isToolSet
          ? (toolDetail.children ?? []).map((child) => child.inputSchema)
          : [])
      ].filter((schema): schema is NonNullable<typeof schema> => Boolean(schema));
      if (schemas.length === 0) return;

      const savedModeMap = new Map<string, AgentToolInputModeEnum>();
      if (Array.isArray(candidate.inputs)) {
        for (const item of candidate.inputs) {
          if (!isPlainObjectRecord(item) || typeof item.key !== 'string') continue;
          if (
            item.mode === AgentToolInputModeEnum.manual ||
            item.mode === AgentToolInputModeEnum.agentGenerated
          ) {
            savedModeMap.set(item.key, item.mode);
          }
        }
      }

      for (const jsonSchema of schemas) {
        const schemaInputs = jsonSchema2NodeInput({
          jsonSchema,
          schemaType: 'systemTool'
        });
        for (const schemaInput of schemaInputs) {
          if (getSelectedInputRenderType(schemaInput) !== FlowNodeInputTypeEnum.selectLLMModel) {
            continue;
          }
          if (savedModeMap.get(schemaInput.key) === AgentToolInputModeEnum.agentGenerated) {
            continue;
          }

          const rawValue = Object.hasOwn(candidate.config, schemaInput.key)
            ? candidate.config[schemaInput.key]
            : schemaInput.defaultValue;
          const modelValue =
            typeof rawValue === 'string'
              ? rawValue.trim()
              : isPlainObjectRecord(rawValue) && typeof rawValue.modelId === 'string'
                ? rawValue.modelId.trim()
                : '';
          if (!modelValue || isWorkflowModelExpression(modelValue)) continue;

          const resolvedId = findModelIdByHandle(modelValue) ?? modelValue;
          resources.push({ type: 'model', id: resolvedId });
        }
      }
    })
  );

  return mergeAppResources(resources);
};

/** 结合同步节点资源提取与 Agent `selectedTools` 的 `selectLLMModel` 异步 schema 提取。 */
export const extractAppResourcesWithToolModels = async ({
  nodes = [],
  chatConfig,
  teamId,
  modelHandle
}: {
  nodes?: Array<StoreNodeItemType | RuntimeNodeItemType>;
  chatConfig?: AppChatConfigType;
  teamId?: string;
  modelHandle?: ModelHandle;
}): Promise<AppResourcesType> => {
  const staticResources = extractAppResources({ nodes, chatConfig });
  const selectedToolModelResources = await extractSelectedToolModelResources({
    nodes,
    teamId,
    modelHandle
  });
  return selectedToolModelResources.length > 0
    ? mergeAppResources([...staticResources, ...selectedToolModelResources])
    : staticResources;
};

type AppDraftResourceSource = Pick<
  AppVersionSchemaType,
  'appId' | 'nodes' | 'chatConfig' | 'resources'
> & { resourceRefs?: unknown };

/**
 * 读取应用草稿授权基线。合法快照直接沿用；非法数组按空基线处理，避免提升未授权引用。
 * 历史缺字段记录先提取资源，再按应用所有者权限过滤；事务重试会重新读取版本与所有者。
 */
export const getAppDraftResourceBaseline = async ({
  appId,
  teamId,
  session,
  draftVersion,
  isRoot = false,
  modelHandle
}: {
  appId: string;
  teamId?: string;
  session?: ClientSession;
  /** 同一事务内已读取的目标应用草稿；null 表示确认无草稿。 */
  draftVersion?: AppDraftResourceSource | null;
  isRoot?: boolean;
  modelHandle?: ModelHandle;
}): Promise<AppResourcesType> => {
  if (draftVersion && String(draftVersion.appId).toLowerCase() !== appId.toLowerCase()) {
    throw new Error('Draft version belongs to another app');
  }
  const draft: AppDraftResourceSource | null =
    draftVersion === undefined ? await getAppDraftVersion(appId, session) : draftVersion;
  if (!draft) return [];
  if (Array.isArray(draft.resources)) {
    const parsed = AppResourcesSchema.safeParse(draft.resources);
    return parsed.success ? mergeAppResources(parsed.data) : [];
  }

  const decodedNodes = decodeToolSetNodesFromStorage(draft.nodes);
  const storedResources = resolveStoredAppResources({
    resources: draft.resources,
    nodes: decodedNodes,
    chatConfig: draft.chatConfig,
    resourceRefs: draft.resourceRefs
  });
  const selectedToolModels = await extractSelectedToolModelResources({
    nodes: decodedNodes,
    teamId,
    modelHandle,
    ignoreToolDetailError: true
  });
  const resources =
    selectedToolModels.length > 0
      ? mergeAppResources([...storedResources, ...selectedToolModels])
      : storedResources;
  if (resources.length === 0) return [];

  const app = await MongoApp.findById(appId, 'tmbId')
    .session(session ?? null)
    .lean();
  if (!app?.tmbId) return [];
  return filterAuthorizedAppResources({
    resources,
    tmbId: String(app.tmbId),
    teamId,
    isRoot,
    modelHandle
  });
};

/**
 * 全部资源必须属于目标团队，系统模型和系统 Skill 除外；仅新增资源重新检查成员 ACL。
 * 保存/自动保存不阻断无权限新增；发布和 Test/Debug 通过 blockOnUnauthorized 阻断。
 * 历史未迁移草稿（缺失 resources 字段）统一按所属应用的所有者 app.tmbId 过滤基线。
 */
export const resolveAppResourcesByPermission = async ({
  appId,
  extracted,
  tmbId,
  teamId,
  isRoot = false,
  blockOnUnauthorized,
  modelHandle,
  session,
  draftVersion
}: {
  appId: string;
  extracted: AppResource[];
  tmbId: string;
  teamId?: string;
  isRoot?: boolean;
  blockOnUnauthorized: boolean;
  /** 调用方已读取的团队模型目录；不传时按需读取。 */
  modelHandle?: ModelHandle;
  session?: ClientSession;
  draftVersion?: AppDraftResourceSource | null;
}) => {
  const baseline = await getAppDraftResourceBaseline({
    appId,
    teamId,
    session,
    draftVersion,
    isRoot,
    modelHandle
  });
  const { kept, added } = splitExtractedAppResources({ extracted, baseline });
  // 快照只继承资源 ACL，不继承跨团队权限；旧快照也必须核对归属。
  const outOfTeam = kept.length
    ? await getAppResourcesOutsideTeam({
        resources: kept,
        teamId: teamId ?? (await getTmbInfoByTmbId({ tmbId })).teamId,
        modelHandle,
        session
      })
    : [];
  if (blockOnUnauthorized && outOfTeam[0]) throw outOfTeam[0].error;
  const deniedKeys = new Set(outOfTeam.map(({ resource }) => getAppResourceKey(resource)));
  const scopedKept = kept.filter((resource) => !deniedKeys.has(getAppResourceKey(resource)));
  if (added.length === 0) return mergeAppResources(scopedKept);

  if (blockOnUnauthorized) {
    await checkAppResourceReadPermissions({
      resources: added,
      tmbId,
      teamId,
      isRoot,
      modelHandle
    });
    return mergeAppResources([...scopedKept, ...added]);
  }

  const authorizedAdded = await filterAuthorizedAppResources({
    resources: added,
    tmbId,
    teamId,
    isRoot,
    modelHandle
  });
  return mergeAppResources([...scopedKept, ...authorizedAdded]);
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
 * 模型类型与启用状态由调用方的 `getModelData` 校验；调用方必须传入读取模型时使用的 handle，避免重复读取目录。
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
      teamId,
      isRoot,
      blockOnUnauthorized: true,
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

/**
 * 为应用调试准备资源快照：规范化模型引用后，校验相对草稿基线新增的资源。
 * 1. 规范化工作流模型引用与字段（formatModels）；
 * 2. 静态提取工作流节点与配置声明的资源快照（extractAppResources）；
 * 返回通过校验的资源列表；运行上下文由调用方在 Workflow 入口创建。
 */
export const prepareAppWorkflowResources = async ({
  appId,
  nodes,
  chatConfig,
  teamId,
  tmbId,
  isRoot = false
}: {
  appId: string;
  nodes?: Array<StoreNodeItemType | RuntimeNodeItemType>;
  chatConfig?: AppChatConfigType;
  teamId: string;
  tmbId: string;
  isRoot?: boolean;
}) => {
  const modelHandle = await getTeamModelHandle({ teamId });
  const authorizedIds = await getAuthorizedModelIds({
    actor: { teamId, tmbId, isRoot },
    handle: modelHandle
  });
  formatModels({
    nodes: nodes as StoreNodeItemType[] | undefined,
    chatConfig,
    models: modelHandle.getActiveModels(),
    defaultModelIds: modelHandle.getDefaultModelIds(authorizedIds),
    modelReferencePolicy: 'preserve'
  });
  const extractedResources = await extractAppResourcesWithToolModels({
    nodes,
    chatConfig,
    teamId,
    modelHandle
  });
  return resolveAppResourcesByPermission({
    appId,
    extracted: extractedResources,
    tmbId,
    teamId,
    isRoot,
    blockOnUnauthorized: true,
    modelHandle
  });
};
