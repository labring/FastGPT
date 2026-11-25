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
  getAgentToolSource,
  getTeamPluginSource,
  isTeamPluginSource,
  resolveSystemToolDetailSource,
  splitCombineToolId
} from '@fastgpt/global/core/app/tool/utils';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { AuthUserTypeEnum } from '@fastgpt/global/support/permission/constant';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import {
  formatModels,
  isWorkflowModelExpression,
  type SelectedToolModelKeysResolver
} from '@fastgpt/global/common/workflow/model';
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

const extractModelIdValue = (value: unknown): string => {
  const modelValue =
    typeof value === 'string'
      ? value.trim()
      : isPlainObjectRecord(value) && typeof value.modelId === 'string'
        ? value.modelId.trim()
        : '';
  return modelValue && !isWorkflowModelExpression(modelValue) ? modelValue : '';
};

/**
 * 粗筛工具配置中是否可能包含手工模型绑定（排除鉴权容器 `systemInputConfig` 及非模型值），
 * 避免仅配置密钥或开关/数字参数的普通工具在发布或保存时触发不必要的插件详情查询。
 */
const hasPotentialModelConfigValue = (config: Record<string, unknown>): boolean =>
  Object.entries(config).some(
    ([key, value]) =>
      key !== NodeInputKeyEnum.systemInputConfig && Boolean(extractModelIdValue(value))
  );

export type ToolDetailErrorPolicy = 'ignore' | 'throw';

export type UnresolvedToolModelCandidate = {
  toolId: string;
  detailSource: string;
  version?: string;
  config: Record<string, unknown>;
  inputs: unknown;
};

export type AppResourcesExtractionResult = {
  resources: AppResourcesType;
  unresolvedToolCandidates: UnresolvedToolModelCandidate[];
};

const getToolCandidateIdentityKey = ({
  toolId,
  detailSource,
  version
}: Pick<UnresolvedToolModelCandidate, 'toolId' | 'detailSource' | 'version'>) =>
  `${detailSource}:${toolId}:${version ?? ''}`;

const getSavedInputModeMap = (inputs: unknown): Map<string, AgentToolInputModeEnum> => {
  const savedModeMap = new Map<string, AgentToolInputModeEnum>();
  if (!Array.isArray(inputs)) return savedModeMap;

  for (const item of inputs) {
    if (!isPlainObjectRecord(item) || typeof item.key !== 'string') continue;
    if (
      item.mode === AgentToolInputModeEnum.manual ||
      item.mode === AgentToolInputModeEnum.agentGenerated
    ) {
      savedModeMap.set(item.key, item.mode);
    }
  }
  return savedModeMap;
};

type SelectedToolCandidateIdentity = {
  toolId: string;
  detailSource: string;
  version?: string;
};

type ToolModelKeysLookupResult = { status: 'resolved'; keys: string[] } | { status: 'unavailable' };

export type SystemToolModelKeyCache = Map<string, Promise<ToolModelKeysLookupResult>>;

export const createSystemToolModelKeyCache = (): SystemToolModelKeyCache => new Map();

const extractSelectedToolIdentity = ({
  tool,
  teamId
}: {
  tool: Record<string, unknown>;
  teamId?: string;
}): SelectedToolCandidateIdentity | undefined => {
  const rawToolId =
    typeof tool.id === 'string' && tool.id.trim()
      ? tool.id.trim()
      : typeof tool.toolId === 'string' && tool.toolId.trim()
        ? tool.toolId.trim()
        : '';
  if (!rawToolId) return undefined;

  let idSource: string;
  try {
    idSource = splitCombineToolId(rawToolId).source;
  } catch {
    return undefined;
  }

  if (idSource !== AppToolSourceEnum.systemTool && idSource !== AppToolSourceEnum.commercial) {
    return undefined;
  }

  const runtimeSource = getAgentToolSource({
    source: typeof tool.source === 'string' ? tool.source : undefined,
    toolConfig: isPlainObjectRecord(tool.toolConfig)
      ? (tool.toolConfig as Parameters<typeof getAgentToolSource>[0]['toolConfig'])
      : undefined
  });
  if (
    isTeamPluginSource(runtimeSource) &&
    teamId &&
    runtimeSource !== getTeamPluginSource(teamId)
  ) {
    return undefined;
  }

  const detailSource = resolveSystemToolDetailSource({
    idSource,
    runtimeSource
  });

  const version =
    typeof tool.version === 'string' && tool.version
      ? tool.version
      : typeof tool.versionId === 'string' && tool.versionId
        ? tool.versionId
        : undefined;

  return {
    toolId: rawToolId,
    detailSource,
    version
  };
};

const extractSelectLLMModelKeysFromToolDetail = (
  toolDetail: Awaited<
    ReturnType<ReturnType<typeof SystemToolRepo.getInstance>['getSystemToolDetail']>
  >
): string[] => {
  if (!toolDetail) return [];

  const schemas = [
    toolDetail.inputSchema,
    ...(toolDetail.isToolSet ? (toolDetail.children ?? []).map((child) => child.inputSchema) : [])
  ].filter((schema): schema is NonNullable<typeof schema> => Boolean(schema));
  if (schemas.length === 0) return [];

  const keys = new Set<string>();
  for (const jsonSchema of schemas) {
    const schemaInputs = jsonSchema2NodeInput({
      jsonSchema,
      schemaType: 'systemTool'
    });
    for (const schemaInput of schemaInputs) {
      if (getSelectedInputRenderType(schemaInput) === FlowNodeInputTypeEnum.selectLLMModel) {
        keys.add(schemaInput.key);
      }
    }
  }
  return Array.from(keys);
};

const lookupSystemToolSelectLLMModelKeys = ({
  identity,
  cache,
  onToolDetailError = 'ignore'
}: {
  identity: SelectedToolCandidateIdentity;
  cache: SystemToolModelKeyCache;
  onToolDetailError?: ToolDetailErrorPolicy;
}): Promise<ToolModelKeysLookupResult> => {
  const cacheKey = getToolCandidateIdentityKey(identity);
  let pending = cache.get(cacheKey);
  if (!pending) {
    const systemToolRepo = SystemToolRepo.getInstance();
    // 按指定版本读取，与 Agent 运行时注册（formatSystemToolNode）保持一致，避免回退 latest 产生版本错位。
    const request = systemToolRepo
      .getSystemToolDetail({
        pluginId: identity.toolId,
        source: identity.detailSource,
        version: identity.version || undefined
      })
      .then(
        (detail): ToolModelKeysLookupResult => ({
          status: 'resolved',
          keys: extractSelectLLMModelKeysFromToolDetail(detail)
        })
      );
    pending =
      onToolDetailError === 'ignore'
        ? request.catch((): ToolModelKeysLookupResult => ({ status: 'unavailable' }))
        : request;
    cache.set(cacheKey, pending);
  }
  return pending;
};

/**
 * 批量预解析工作流内 Agent `selectedTools` 的 `selectLLMModel` 键位，返回供同步遍历复用的只读解析器。
 * 支持跨批次传入共享 `cache`，避免失效模型批量替换时重复查询相同插件详情。
 */
export const resolveSelectedToolModelKeysResolver = async ({
  nodes,
  teamId,
  cache = createSystemToolModelKeyCache(),
  onToolDetailError = 'ignore'
}: {
  nodes?: unknown;
  teamId?: string;
  cache?: SystemToolModelKeyCache;
  onToolDetailError?: ToolDetailErrorPolicy;
}): Promise<SelectedToolModelKeysResolver | undefined> => {
  if (!Array.isArray(nodes)) return undefined;

  const candidates = collectSelectedToolModelCandidates({
    nodes: nodes as Array<StoreNodeItemType | RuntimeNodeItemType>,
    teamId
  });
  if (candidates.length === 0) return undefined;

  const resolvedKeysByIdentity = new Map<string, string[]>();
  const uniqueIdentities = new Map<string, SelectedToolCandidateIdentity>();
  for (const candidate of candidates) {
    const key = getToolCandidateIdentityKey(candidate);
    if (!uniqueIdentities.has(key)) {
      uniqueIdentities.set(key, candidate);
    }
  }

  await Promise.all(
    Array.from(uniqueIdentities.entries()).map(async ([cacheKey, identity]) => {
      const result = await lookupSystemToolSelectLLMModelKeys({
        identity,
        cache,
        onToolDetailError
      });
      if (result.status === 'resolved' && result.keys.length > 0) {
        resolvedKeysByIdentity.set(cacheKey, result.keys);
      }
    })
  );

  if (resolvedKeysByIdentity.size === 0) return undefined;

  return (tool: Record<string, unknown>) => {
    const identity = extractSelectedToolIdentity({ tool, teamId });
    if (!identity) return [];
    return resolvedKeysByIdentity.get(getToolCandidateIdentityKey(identity)) ?? [];
  };
};

const collectSelectedToolModelCandidates = ({
  nodes = [],
  teamId
}: {
  nodes?: Array<StoreNodeItemType | RuntimeNodeItemType>;
  teamId?: string;
}): UnresolvedToolModelCandidate[] => {
  const candidates: UnresolvedToolModelCandidate[] = [];

  for (const node of nodes) {
    if (!isPlainObjectRecord(node) || node.flowNodeType !== FlowNodeTypeEnum.agent) continue;

    for (const input of Array.isArray(node.inputs) ? node.inputs : []) {
      if (
        !isPlainObjectRecord(input) ||
        input.key !== NodeInputKeyEnum.selectedTools ||
        nodeInputIsReference(input as FlowNodeInputItemType)
      ) {
        continue;
      }
      if (!Array.isArray(input.value)) continue;

      for (const tool of input.value) {
        if (!isPlainObjectRecord(tool) || !isPlainObjectRecord(tool.config)) continue;
        if (!hasPotentialModelConfigValue(tool.config)) continue;

        const identity = extractSelectedToolIdentity({ tool, teamId });
        if (!identity) continue;

        candidates.push({
          ...identity,
          config: tool.config,
          inputs: tool.inputs
        });
      }
    }
  }

  return candidates;
};

const resolveModelHandleForToolExtraction = async ({
  teamId,
  modelHandle
}: {
  teamId?: string;
  modelHandle?: ModelHandle;
}): Promise<ModelHandle | undefined> =>
  modelHandle ??
  (teamId
    ? await getTeamModelHandle({ teamId }).catch(() => undefined)
    : typeof getSystemModelHandle === 'function'
      ? await getSystemModelHandle().catch(() => undefined)
      : undefined);

const createModelIdResolver =
  (resolveHandle?: ModelHandle) =>
  (value: string): string => {
    if (!resolveHandle || typeof resolveHandle.findModelData !== 'function') return value;
    return (
      resolveHandle.findModelData({ modelId: value })?.modelId ??
      resolveHandle.findModelData({ model: value }, { type: ModelTypeEnum.llm })?.modelId ??
      value
    );
  };

const collectManualModelConfigEntries = ({
  candidate,
  resolveModelId
}: {
  candidate: UnresolvedToolModelCandidate;
  resolveModelId: (value: string) => string;
}): Map<string, string> => {
  const savedModeMap = getSavedInputModeMap(candidate.inputs);
  const entries = new Map<string, string>();
  for (const [key, value] of Object.entries(candidate.config)) {
    if (key === NodeInputKeyEnum.systemInputConfig) continue;
    if (savedModeMap.get(key) === AgentToolInputModeEnum.agentGenerated) continue;
    const modelValue = extractModelIdValue(value);
    if (!modelValue) continue;
    entries.set(key, resolveModelId(modelValue));
  }
  return entries;
};

/**
 * 从 Agent 节点的 `selectedTools[*].config` 中提取系统/商业工具声明的 `selectLLMModel` 模型引用，
 * 并显式区分「已提取模型」与「暂无法读取详情的候选工具」。
 *
 * `migrateWorkflowToCurrent()` 会将 `selectedTools[*].inputs` 归一为 `{ key, mode }` 稀疏结构并移除
 * `renderTypeList`，因此需要通过 `SystemToolRepo` 读取工具真实 schema，识别 `selectLLMModel` 输入键
 * 并仅提取未设为 `agentGenerated` 的手工模型配置，确保：
 * 1. 发布/调试时受 `resolveAppResourcesByPermission` 权限校验约束（防止无权限编辑者夹带未授权模型）；
 * 2. 合法模型写入 `AppVersion.resources`，让已发布应用及 `model:invoke` 反向调用准确继承发布者快照授权；
 * 3. 草稿保存时若工具详情暂不可用，保留 `unresolvedToolCandidates` 供基线比对，避免覆盖丢失未改动的已授权绑定。
 *
 * 错误策略由调用方按入口语义显式选择：
 * - 创建/复制/草稿自动保存/历史基线回填使用 `'ignore'`，不因已下架普通工具或插件服务抖动阻断编辑；
 * - 正式发布（`isPublish`）与调试运行使用 `'throw'`，无法验证工具定义时阻断发布并保留原发布版本。
 */
const inspectSelectedToolModelResources = async ({
  nodes = [],
  teamId,
  modelHandle,
  onToolDetailError = 'ignore'
}: {
  nodes?: Array<StoreNodeItemType | RuntimeNodeItemType>;
  teamId?: string;
  modelHandle?: ModelHandle;
  onToolDetailError?: ToolDetailErrorPolicy;
}): Promise<AppResourcesExtractionResult> => {
  const candidates = collectSelectedToolModelCandidates({ nodes, teamId });

  if (candidates.length === 0) {
    return {
      resources: [],
      unresolvedToolCandidates: []
    };
  }

  const modelKeyCache = createSystemToolModelKeyCache();
  const resolveHandle = await resolveModelHandleForToolExtraction({ teamId, modelHandle });
  const resolveModelId = createModelIdResolver(resolveHandle);
  const resources: AppResource[] = [];
  const unresolvedToolCandidates: UnresolvedToolModelCandidate[] = [];

  await Promise.all(
    candidates.map(async (candidate) => {
      const lookupResult = await lookupSystemToolSelectLLMModelKeys({
        identity: candidate,
        cache: modelKeyCache,
        onToolDetailError
      });
      if (lookupResult.status === 'unavailable') {
        unresolvedToolCandidates.push(candidate);
        return;
      }

      const savedModeMap = getSavedInputModeMap(candidate.inputs);

      for (const key of lookupResult.keys) {
        if (savedModeMap.get(key) === AgentToolInputModeEnum.agentGenerated) {
          continue;
        }

        // 仅提取用户在 config 中显式配置的模型，不回退插件 Schema 静态默认值，保持正常提取与草稿降级规则一致。
        if (!Object.hasOwn(candidate.config, key)) continue;
        const modelValue = extractModelIdValue(candidate.config[key]);
        if (!modelValue) continue;

        resources.push({ type: 'model', id: resolveModelId(modelValue) });
      }
    })
  );

  return {
    resources: mergeAppResources(resources),
    unresolvedToolCandidates
  };
};

export const extractSelectedToolModelResources = async ({
  nodes = [],
  teamId,
  modelHandle,
  onToolDetailError = 'ignore'
}: {
  nodes?: Array<StoreNodeItemType | RuntimeNodeItemType>;
  teamId?: string;
  modelHandle?: ModelHandle;
  onToolDetailError?: ToolDetailErrorPolicy;
}): Promise<AppResourcesType> => {
  const { resources } = await inspectSelectedToolModelResources({
    nodes,
    teamId,
    modelHandle,
    onToolDetailError
  });
  return resources;
};

/**
 * 结合同步节点资源提取与 Agent `selectedTools` 的 `selectLLMModel` 异步 schema 提取，
 * 同时返回暂无法读取详情的候选工具列表，供草稿保存时保守继承未改动的已验证绑定。
 */
export const inspectAppResourcesWithToolModels = async ({
  nodes = [],
  chatConfig,
  teamId,
  modelHandle,
  onToolDetailError = 'ignore'
}: {
  nodes?: Array<StoreNodeItemType | RuntimeNodeItemType>;
  chatConfig?: AppChatConfigType;
  teamId?: string;
  modelHandle?: ModelHandle;
  onToolDetailError?: ToolDetailErrorPolicy;
}): Promise<AppResourcesExtractionResult> => {
  const staticResources = extractAppResources({ nodes, chatConfig });
  const { resources: selectedToolModelResources, unresolvedToolCandidates } =
    await inspectSelectedToolModelResources({
      nodes,
      teamId,
      modelHandle,
      onToolDetailError
    });
  return {
    resources:
      selectedToolModelResources.length > 0
        ? mergeAppResources([...staticResources, ...selectedToolModelResources])
        : staticResources,
    unresolvedToolCandidates
  };
};

/** 结合同步节点资源提取与 Agent `selectedTools` 的 `selectLLMModel` 异步 schema 提取。 */
export const extractAppResourcesWithToolModels = async ({
  nodes = [],
  chatConfig,
  teamId,
  modelHandle,
  onToolDetailError = 'ignore'
}: {
  nodes?: Array<StoreNodeItemType | RuntimeNodeItemType>;
  chatConfig?: AppChatConfigType;
  teamId?: string;
  modelHandle?: ModelHandle;
  onToolDetailError?: ToolDetailErrorPolicy;
}): Promise<AppResourcesType> => {
  const { resources } = await inspectAppResourcesWithToolModels({
    nodes,
    chatConfig,
    teamId,
    modelHandle,
    onToolDetailError
  });
  return resources;
};

/**
 * 在草稿保存降级场景下，仅保留可以确认与上一版草稿完全未变且已在基线中验证过的模型绑定：
 * 1. 上一版草稿中存在同一 `(toolId, detailSource, version)` 的工具；
 * 2. 同一配置键在当前节点与上一版草稿中均非 `agentGenerated`，且规范化后的模型 ID 一致；
 * 3. 该模型资源已存在于上一版草稿的已验证基线中。
 */
const resolvePreservedUnresolvedToolModelResources = async ({
  unresolvedToolCandidates,
  draftNodes,
  baseline,
  teamId,
  modelHandle
}: {
  unresolvedToolCandidates: UnresolvedToolModelCandidate[];
  draftNodes: Array<StoreNodeItemType | RuntimeNodeItemType>;
  baseline: AppResourcesType;
  teamId?: string;
  modelHandle?: ModelHandle;
}): Promise<AppResourcesType> => {
  if (unresolvedToolCandidates.length === 0 || baseline.length === 0) return [];

  const baselineModelIds = new Set(
    baseline.filter((resource) => resource.type === 'model').map((resource) => resource.id)
  );
  if (baselineModelIds.size === 0) return [];

  const draftCandidates = collectSelectedToolModelCandidates({
    nodes: draftNodes,
    teamId
  });
  if (draftCandidates.length === 0) return [];

  const resolveHandle = await resolveModelHandleForToolExtraction({ teamId, modelHandle });
  const resolveModelId = createModelIdResolver(resolveHandle);

  const draftCandidatesByIdentity = new Map<string, Map<string, string>[]>();
  for (const draftCandidate of draftCandidates) {
    const identityKey = getToolCandidateIdentityKey(draftCandidate);
    const manualEntries = collectManualModelConfigEntries({
      candidate: draftCandidate,
      resolveModelId
    });
    if (manualEntries.size === 0) continue;

    const group = draftCandidatesByIdentity.get(identityKey);
    if (group) {
      group.push(manualEntries);
    } else {
      draftCandidatesByIdentity.set(identityKey, [manualEntries]);
    }
  }

  const preserved: AppResource[] = [];
  for (const candidate of unresolvedToolCandidates) {
    const draftGroups = draftCandidatesByIdentity.get(getToolCandidateIdentityKey(candidate));
    if (!draftGroups?.length) continue;

    const currentEntries = collectManualModelConfigEntries({
      candidate,
      resolveModelId
    });
    for (const [key, modelId] of currentEntries) {
      if (!baselineModelIds.has(modelId)) continue;
      if (draftGroups.some((draftEntries) => draftEntries.get(key) === modelId)) {
        preserved.push({ type: 'model', id: modelId });
      }
    }
  }

  return mergeAppResources(preserved);
};

type AppDraftResourceSource = Pick<
  AppVersionSchemaType,
  'appId' | 'nodes' | 'chatConfig' | 'resources'
> & { resourceRefs?: unknown };

const resolveBaselineFromDraft = async ({
  appId,
  draft,
  teamId,
  session,
  isRoot = false,
  modelHandle
}: {
  appId: string;
  draft: AppDraftResourceSource | null;
  teamId?: string;
  session?: ClientSession;
  isRoot?: boolean;
  modelHandle?: ModelHandle;
}): Promise<AppResourcesType> => {
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
    onToolDetailError: 'ignore'
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
  return resolveBaselineFromDraft({
    appId,
    draft,
    teamId,
    session,
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
  unresolvedToolCandidates,
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
  /** 提取阶段暂无法读取工具详情的 Agent 工具候选，仅用于草稿降级时保留可确认未变的已验证基线绑定。 */
  unresolvedToolCandidates?: UnresolvedToolModelCandidate[];
  tmbId: string;
  teamId?: string;
  isRoot?: boolean;
  blockOnUnauthorized: boolean;
  /** 调用方已读取的团队模型目录；不传时按需读取。 */
  modelHandle?: ModelHandle;
  session?: ClientSession;
  draftVersion?: AppDraftResourceSource | null;
}) => {
  if (draftVersion && String(draftVersion.appId).toLowerCase() !== appId.toLowerCase()) {
    throw new Error('Draft version belongs to another app');
  }
  const resolvedDraft: AppDraftResourceSource | null =
    draftVersion === undefined ? await getAppDraftVersion(appId, session) : draftVersion;
  const baseline = await resolveBaselineFromDraft({
    appId,
    draft: resolvedDraft,
    teamId,
    session,
    isRoot,
    modelHandle
  });
  // 工具详情暂不可用时，仅保守继承与上一版草稿完全未变且已验证的模型绑定，避免降级草稿覆盖丢失基线。
  const preservedUnresolvedModels =
    !blockOnUnauthorized && unresolvedToolCandidates?.length && resolvedDraft
      ? await resolvePreservedUnresolvedToolModelResources({
          unresolvedToolCandidates,
          draftNodes: decodeToolSetNodesFromStorage(resolvedDraft.nodes),
          baseline,
          teamId,
          modelHandle
        })
      : [];
  const effectiveExtracted =
    preservedUnresolvedModels.length > 0
      ? mergeAppResources([...extracted, ...preservedUnresolvedModels])
      : extracted;
  const { kept, added } = splitExtractedAppResources({ extracted: effectiveExtracted, baseline });
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
    modelHandle,
    onToolDetailError: 'throw'
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
