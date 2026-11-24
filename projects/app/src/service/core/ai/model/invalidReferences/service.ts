import { getModelReferenceValue, isEmptyModelValue } from '@fastgpt/global/core/ai/model/reference';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { isModelConfigError } from '@fastgpt/global/common/error/model';
import {
  getWorkflowNodeModelInputs,
  isWorkflowModelExpression,
  isWorkflowSystemModelInput
} from '@fastgpt/global/common/workflow/model';
import {
  getSelectedInputRenderType,
  nodeInputIsReference
} from '@fastgpt/global/common/workflow/reference';
import {
  workflowDatasetParamModelSlots,
  workflowSystemModelSlots
} from '@fastgpt/global/core/workflow/model/constants';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import type { AppVersionSchemaType } from '@fastgpt/global/core/app/version/type';
import { legacySystemConfigNodeType } from '@fastgpt/global/core/workflow/migration/legacy/systemConfig';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import {
  AppResourcesSchema,
  type AppChatConfigType,
  type AppResource,
  type AppResourcesType
} from '@fastgpt/global/core/app/type';
import type { ModelHandle } from '@fastgpt/service/core/ai/model/catalog/handle';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { decodeToolSetNodesFromStorage } from '@fastgpt/service/core/app/jsonSchemaStorage';
import { getAppResourceKey } from '@fastgpt/service/core/app/resource/utils';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { migrateWorkflowToCurrent } from '@fastgpt/global/common/workflow/migration';
import { cloneDeep } from 'lodash-es';
import { Types } from 'mongoose';

type ModelKind = 'llm' | 'tts' | 'rerank';
type ResourceKind = 'dataset' | 'app' | 'version';
type Count = {
  scannedRecords: number;
  replacedRecords: number;
  replacedReferences: number;
  skippedReferences: number;
  conflicts: number;
  failedRecords: number;
};
type Change = { replacedReferences: number; skippedReferences: number };
type Reference = { modelId?: unknown; model?: unknown };
type PlainObject = Record<string, unknown>;
type Replacement = { llmModelId: string; ttsModelId: string; rerankModelId: string };
type Model = ReturnType<ModelHandle['getAllModels']>[number];
type LegacyAppRow = {
  _id: string;
  modules?: StoreNodeItemType[];
  chatConfig?: AppChatConfigType;
};
type LegacyAppVersionRow = AppVersionSchemaType & { resourceRefs?: unknown };

export type ReplaceInvalidModelReferencesResult = {
  completed: boolean;
  counts: Record<ResourceKind, Record<ModelKind, Count>>;
  failedSamples: Array<{ resourceType: ResourceKind; resourceId: string; reason: string }>;
  stoppedReason?: 'conditions_changed' | 'scan_interrupted';
};

const batchSize = 50;
const maxFailedSamples = 20;
const modelKinds: ModelKind[] = ['llm', 'tts', 'rerank'];

const isObject = (value: unknown): value is PlainObject =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const migrateStoredWorkflow = ({
  nodes,
  edges,
  chatConfig
}: {
  nodes?: unknown;
  edges?: unknown;
  chatConfig?: unknown;
}) =>
  migrateWorkflowToCurrent({
    nodes: decodeToolSetNodesFromStorage(Array.isArray(nodes) ? nodes : []),
    edges,
    chatConfig
  });

const newChanges = (): Record<ModelKind, Change> => ({
  llm: { replacedReferences: 0, skippedReferences: 0 },
  tts: { replacedReferences: 0, skippedReferences: 0 },
  rerank: { replacedReferences: 0, skippedReferences: 0 }
});

const newCounts = (): ReplaceInvalidModelReferencesResult['counts'] => {
  const count = (): Count => ({
    scannedRecords: 0,
    replacedRecords: 0,
    replacedReferences: 0,
    skippedReferences: 0,
    conflicts: 0,
    failedRecords: 0
  });
  const byModel = () => ({ llm: count(), tts: count(), rerank: count() });
  return { dataset: byModel(), app: byModel(), version: byModel() };
};

/** 只处理可静态确定的模型引用；保留空值、表达式和工作流变量。 */
export const createInvalidReferenceReplacer = ({
  handle,
  replacement
}: {
  handle: ModelHandle;
  replacement: Replacement;
}) => {
  const models = handle.getAllModels();
  const modelsById = new Map(models.map((model) => [model.modelId, model]));
  const targets: Record<ModelKind, Model> = {
    llm: modelsById.get(replacement.llmModelId)!,
    tts: modelsById.get(replacement.ttsModelId)!,
    rerank: modelsById.get(replacement.rerankModelId)!
  };
  const ttsTarget = targets.tts;
  if (!targets.llm || !ttsTarget || !targets.rerank) {
    throw new Error('Replacement model not found');
  }
  if (ttsTarget.type !== ModelTypeEnum.tts) throw new Error('Replacement TTS type mismatch');
  const firstTtsVoice = ttsTarget.config.voices.find(({ value }) => value.trim().length > 0)?.value;
  if (!firstTtsVoice) throw new Error('Replacement TTS must have an available voice');

  const getKind = (type: ModelTypeEnum): ModelKind =>
    type === ModelTypeEnum.rerank ? 'rerank' : type === ModelTypeEnum.tts ? 'tts' : 'llm';

  // 旧知识库可能把模型 ID 存为 BSON ObjectId；仅在判断引用时转成字符串。
  const getReferenceValue = (reference: Reference) => {
    const value = getModelReferenceValue(reference);
    return value instanceof Types.ObjectId ? String(value) : value;
  };

  const isInvalid = ({
    reference,
    type,
    vision = false
  }: {
    reference: Reference;
    type: ModelTypeEnum;
    vision?: boolean;
  }) => {
    const value = getReferenceValue(reference);
    if (isEmptyModelValue(value) || Array.isArray(value) || isWorkflowModelExpression(value)) {
      return undefined;
    }
    if (typeof value !== 'string') return undefined;

    const modelReference = isEmptyModelValue(reference.modelId)
      ? { model: value }
      : { modelId: value };
    try {
      handle.getModelData(modelReference, { type, vision });
      return false;
    } catch (error) {
      if (isModelConfigError(error)) return true;
      throw error;
    }
  };

  /** 自定义模型选择器兼容旧版 model 名称，同时优先保留可识别的 modelId。 */
  const getLLMSelectorReference = (value: unknown): Reference => {
    if (typeof value === 'string' && !handle.findModelData({ modelId: value })) {
      return { model: value };
    }
    return { modelId: value };
  };

  const replaceConfigReference = ({
    config,
    modelIdKey,
    legacyKey,
    type,
    vision,
    changes,
    preserveLegacyField = true
  }: {
    config: PlainObject;
    modelIdKey: string;
    legacyKey: string;
    type: ModelTypeEnum;
    vision?: boolean;
    changes: Record<ModelKind, Change>;
    preserveLegacyField?: boolean;
  }) => {
    const kind = getKind(type);
    const reference = { modelId: config[modelIdKey], model: config[legacyKey] };
    const invalid = isInvalid({ reference, type, vision });
    if (invalid === undefined) {
      changes[kind].skippedReferences++;
      return;
    }
    if (!invalid) return;
    config[modelIdKey] = targets[kind].modelId;
    if (!preserveLegacyField || !isEmptyModelValue(config[legacyKey])) {
      config[legacyKey] = targets[kind].model;
    }
    if (type === ModelTypeEnum.tts) config.voice = firstTtsVoice;
    changes[kind].replacedReferences++;
  };

  const replaceNodes = ({
    nodes,
    referenceNodes,
    changes
  }: {
    nodes: unknown;
    referenceNodes?: StoreNodeItemType[];
    changes: Record<ModelKind, Change>;
  }) => {
    if (!Array.isArray(nodes)) return;
    const referenceNodeById = new Map(referenceNodes?.map((node) => [node.nodeId, node]));
    nodes.forEach((rawNode, nodeIndex) => {
      if (!isObject(rawNode) || !Array.isArray(rawNode.inputs)) return;
      const node = rawNode as StoreNodeItemType;
      if (!node.inputs.every(isObject)) return;
      const referenceNode = node.nodeId
        ? referenceNodeById.get(node.nodeId)
        : referenceNodes?.[nodeIndex];
      const getReferenceInput = (input: StoreNodeItemType['inputs'][number]) =>
        referenceNode?.inputs.find((referenceInput) => referenceInput.key === input.key) ?? input;
      const isReferenceInput = (input: StoreNodeItemType['inputs'][number]) =>
        nodeInputIsReference(getReferenceInput(input));

      for (const slot of workflowSystemModelSlots) {
        const { modelIdInputs, legacyInputs } = getWorkflowNodeModelInputs({ node, slot });
        const effectiveInputs = modelIdInputs.length > 0 ? modelIdInputs : legacyInputs;
        const kind = getKind(slot.type);
        for (const input of effectiveInputs) {
          if (isReferenceInput(input)) {
            changes[kind].skippedReferences++;
            continue;
          }
          const reference = {
            modelId: input.key === slot.modelIdKey ? input.value : undefined,
            model: input.key === slot.legacyKey ? input.value : legacyInputs[0]?.value
          };
          const invalid = isInvalid({ reference, type: slot.type });
          if (invalid === undefined) {
            changes[kind].skippedReferences++;
            continue;
          }
          if (!invalid) continue;
          const target = targets[kind];
          if (input.key === slot.modelIdKey) {
            input.value = target.modelId;
            legacyInputs.forEach((legacy) => {
              if (!isReferenceInput(legacy)) legacy.value = target.model;
            });
          } else {
            input.value = target.model;
            node.inputs.push({ ...input, key: slot.modelIdKey, value: target.modelId });
          }
          changes[kind].replacedReferences++;
        }
      }

      const migratedNode = referenceNode ?? node;
      for (const input of node.inputs) {
        const migratedInput = getReferenceInput(input);
        if (isWorkflowSystemModelInput({ node: migratedNode, input: migratedInput })) continue;
        if (isReferenceInput(input)) {
          if (migratedInput.renderTypeList?.includes(FlowNodeInputTypeEnum.selectLLMModel)) {
            changes.llm.skippedReferences++;
          }
          continue;
        }
        if (getSelectedInputRenderType(migratedInput) !== FlowNodeInputTypeEnum.selectLLMModel) {
          continue;
        }

        const modelValue = migratedInput.value ?? migratedInput.defaultValue;
        const invalid = isInvalid({
          reference: getLLMSelectorReference(modelValue),
          type: ModelTypeEnum.llm
        });
        if (invalid === undefined) {
          changes.llm.skippedReferences++;
          continue;
        }
        if (!invalid) continue;

        if (input.value !== undefined && input.value !== null) {
          input.value = targets.llm.modelId;
        } else if (input.defaultValue !== undefined && input.defaultValue !== null) {
          input.defaultValue = targets.llm.modelId;
        } else {
          input.value = targets.llm.modelId;
        }
        changes.llm.replacedReferences++;
      }

      if ((node.flowNodeType as string) === legacySystemConfigNodeType) {
        // 读取路径会把旧 userGuide 配置迁入 chatConfig；写入时保留节点原形，只更新引用值。
        for (const [inputKey, type] of [
          [NodeInputKeyEnum.questionGuide, ModelTypeEnum.llm],
          [NodeInputKeyEnum.tts, ModelTypeEnum.tts]
        ] as const) {
          const input = node.inputs.find(({ key }) => key === inputKey);
          if (!input || isReferenceInput(input) || !isObject(input.value)) continue;

          const config = input.value;
          if (type === ModelTypeEnum.tts && config.type !== 'model') continue;
          replaceConfigReference({
            config,
            modelIdKey: 'modelId',
            legacyKey: 'model',
            type,
            changes
          });
        }
      }

      if (node.flowNodeType !== FlowNodeTypeEnum.agent) return;
      const paramsInput = node.inputs.find((input) => input.key === NodeInputKeyEnum.datasetParams);
      if (!paramsInput || isReferenceInput(paramsInput) || !isObject(paramsInput.value)) return;
      for (const slot of workflowDatasetParamModelSlots) {
        replaceConfigReference({
          config: paramsInput.value,
          modelIdKey: slot.modelIdKey,
          legacyKey: slot.legacyKey,
          type: slot.type,
          changes
        });
      }
    });
  };

  const replaceAppContent = ({
    nodes,
    chatConfig,
    referenceNodes
  }: {
    nodes?: unknown;
    chatConfig?: unknown;
    referenceNodes?: StoreNodeItemType[];
  }) => {
    const nextNodes = cloneDeep(nodes);
    const nextChatConfig = cloneDeep(chatConfig);
    const changes = newChanges();
    replaceNodes({ nodes: nextNodes, referenceNodes, changes });
    if (isObject(nextChatConfig) && isObject(nextChatConfig.questionGuide)) {
      replaceConfigReference({
        config: nextChatConfig.questionGuide,
        modelIdKey: 'modelId',
        legacyKey: 'model',
        type: ModelTypeEnum.llm,
        changes
      });
    }
    if (
      isObject(nextChatConfig) &&
      isObject(nextChatConfig.ttsConfig) &&
      nextChatConfig.ttsConfig.type === 'model'
    ) {
      replaceConfigReference({
        config: nextChatConfig.ttsConfig,
        modelIdKey: 'modelId',
        legacyKey: 'model',
        type: ModelTypeEnum.tts,
        changes
      });
    }
    return { nodes: nextNodes, chatConfig: nextChatConfig, changes };
  };

  return { isInvalid, replaceConfigReference, replaceAppContent, newChanges };
};

/** 在单个 HTTP 请求内扫描团队资源，并按原值条件逐条提交替换。 */
export const replaceInvalidModelReferences = async ({
  teamId,
  replacement,
  handle,
  assertCanContinue
}: {
  teamId: string;
  replacement: Replacement;
  handle: ModelHandle;
  assertCanContinue: () => Promise<void>;
}): Promise<ReplaceInvalidModelReferencesResult> => {
  const replacer = createInvalidReferenceReplacer({ handle, replacement });
  const counts = newCounts();
  const failedSamples: ReplaceInvalidModelReferencesResult['failedSamples'] = [];
  const teamObjectId = new Types.ObjectId(teamId);
  const result: ReplaceInvalidModelReferencesResult = { completed: true, counts, failedSamples };
  const replacementResources: Record<ModelKind, AppResource> = {
    llm: { type: 'model', id: replacement.llmModelId },
    tts: { type: 'model', id: replacement.ttsModelId },
    rerank: { type: 'model', id: replacement.rerankModelId }
  };
  const targetSupportsVision =
    replacer.isInvalid({
      reference: { modelId: replacement.llmModelId },
      type: ModelTypeEnum.llm,
      vision: true
    }) === false;
  const logger = getLogger(LogCategories.MODULE.AI.CONFIG);
  let stopError: unknown;

  const logBatch = ({
    stage,
    resourceType,
    rows,
    appId
  }: {
    stage: 'scanned' | 'replacing' | 'replaced';
    resourceType: ResourceKind;
    rows: ReadonlyArray<{ _id: unknown }>;
    appId?: string;
  }) => {
    logger.info(`Invalid model replacement batch ${stage}`, {
      teamId,
      resourceType,
      ...(appId ? { appId } : {}),
      batchRecords: rows.length,
      lastId: String(rows[rows.length - 1]._id),
      ...(stage === 'replaced'
        ? {
            replacedReferences: modelKinds.reduce(
              (total, kind) => total + counts[resourceType][kind].replacedReferences,
              0
            ),
            failedRecords: modelKinds.reduce(
              (total, kind) => total + counts[resourceType][kind].failedRecords,
              0
            )
          }
        : {})
    });
  };

  const assertWritable = async () => {
    try {
      await assertCanContinue();
    } catch (error) {
      stopError = error;
      throw error;
    }
  };

  const addFailure = (resourceType: ResourceKind, resourceId: string, reason: string) => {
    if (failedSamples.length < maxFailedSamples) {
      failedSamples.push({ resourceType, resourceId, reason });
    }
  };
  const addChanges = (
    resource: ResourceKind,
    changes: Record<ModelKind, Change>,
    written: boolean
  ) => {
    for (const kind of modelKinds) {
      counts[resource][kind].replacedReferences += written ? changes[kind].replacedReferences : 0;
      counts[resource][kind].skippedReferences += changes[kind].skippedReferences;
      if (written && changes[kind].replacedReferences > 0) {
        counts[resource][kind].replacedRecords++;
      }
    }
  };
  const fieldMatch = (field: string, value: unknown) =>
    value === undefined ? { [field]: { $exists: false } } : { [field]: value };

  // 非视觉目标不能替换图片理解槽位，必须在第一条写入前完成全团队检查。
  if (!targetSupportsVision) {
    let after: string | undefined;
    while (true) {
      const rows = await MongoDataset.collection
        .find(
          {
            teamId: teamObjectId,
            ...(after ? { _id: { $gt: new Types.ObjectId(after) } } : {})
          },
          { projection: { _id: 1, vlmModelId: 1, vlmModel: 1 } }
        )
        .sort({ _id: 1 })
        .limit(batchSize)
        .toArray();
      if (rows.length === 0) break;
      for (const row of rows) {
        if (
          replacer.isInvalid({
            reference: { modelId: row.vlmModelId, model: row.vlmModel },
            type: ModelTypeEnum.llm,
            vision: true
          })
        ) {
          throw new Error('Replacement LLM must support vision for invalid dataset image models');
        }
      }
      after = String(rows[rows.length - 1]._id);
    }
  }

  try {
    const datasetMax = await MongoDataset.collection.findOne(
      { teamId: teamObjectId },
      { sort: { _id: -1 }, projection: { _id: 1 } }
    );
    const appMax = await MongoApp.findOne({ teamId: teamObjectId })
      .sort({ _id: -1 })
      .select('_id')
      .lean();
    const versionMax = await MongoAppVersion.findOne({}).sort({ _id: -1 }).select('_id').lean();

    let datasetAfter: string | undefined;
    while (datasetMax) {
      await assertWritable();
      const rows = await MongoDataset.collection
        .find(
          {
            teamId: teamObjectId,
            _id: {
              ...(datasetAfter ? { $gt: new Types.ObjectId(datasetAfter) } : {}),
              $lte: datasetMax._id
            }
          },
          { projection: { _id: 1, agentModelId: 1, agentModel: 1, vlmModelId: 1, vlmModel: 1 } }
        )
        .sort({ _id: 1 })
        .limit(batchSize)
        .toArray();
      if (rows.length === 0) break;
      logBatch({ stage: 'scanned', resourceType: 'dataset', rows });
      logBatch({ stage: 'replacing', resourceType: 'dataset', rows });
      for (const row of rows) {
        counts.dataset.llm.scannedRecords++;
        try {
          let current = row;
          for (let attempt = 0; attempt < 3; attempt++) {
            // 预检查后若有并发改写，也不能把图片理解引用换成纯文本模型。
            if (
              !targetSupportsVision &&
              replacer.isInvalid({
                reference: { modelId: current.vlmModelId, model: current.vlmModel },
                type: ModelTypeEnum.llm,
                vision: true
              })
            ) {
              stopError = new Error('Replacement LLM must support vision');
              throw stopError;
            }
            const next = cloneDeep(current);
            const changes = newChanges();
            replacer.replaceConfigReference({
              config: next,
              modelIdKey: 'agentModelId',
              legacyKey: 'agentModel',
              type: ModelTypeEnum.llm,
              changes,
              preserveLegacyField: false
            });
            const agentReplaced = changes.llm.replacedReferences > 0;
            const beforeVlm = changes.llm.replacedReferences;
            replacer.replaceConfigReference({
              config: next,
              modelIdKey: 'vlmModelId',
              legacyKey: 'vlmModel',
              type: ModelTypeEnum.llm,
              vision: true,
              changes,
              preserveLegacyField: false
            });
            const vlmReplaced = changes.llm.replacedReferences > beforeVlm;
            if (changes.llm.replacedReferences === 0) {
              addChanges('dataset', changes, false);
              break;
            }
            await assertWritable();
            const written = await MongoDataset.collection.updateOne(
              {
                _id: new Types.ObjectId(String(current._id)),
                teamId: teamObjectId,
                ...fieldMatch('agentModelId', current.agentModelId),
                ...fieldMatch('agentModel', current.agentModel),
                ...fieldMatch('vlmModelId', current.vlmModelId),
                ...fieldMatch('vlmModel', current.vlmModel)
              },
              {
                $set: {
                  ...(agentReplaced
                    ? { agentModelId: next.agentModelId, agentModel: next.agentModel }
                    : {}),
                  ...(vlmReplaced ? { vlmModelId: next.vlmModelId, vlmModel: next.vlmModel } : {})
                }
              }
            );
            if (written.modifiedCount > 0) {
              addChanges('dataset', changes, true);
              break;
            }
            if (attempt === 2) {
              counts.dataset.llm.conflicts++;
              counts.dataset.llm.failedRecords++;
              addFailure('dataset', String(row._id), 'Concurrent update');
              break;
            }
            const refreshed = await MongoDataset.collection.findOne(
              { _id: row._id },
              {
                projection: { _id: 1, agentModelId: 1, agentModel: 1, vlmModelId: 1, vlmModel: 1 }
              }
            );
            if (!refreshed) break;
            current = refreshed;
          }
        } catch (error) {
          if (stopError) throw error;
          counts.dataset.llm.failedRecords++;
          addFailure(
            'dataset',
            String(row._id),
            error instanceof Error ? error.name : 'Update failed'
          );
        }
      }
      logBatch({ stage: 'replaced', resourceType: 'dataset', rows });
      datasetAfter = String(rows[rows.length - 1]._id);
    }

    let appAfter: string | undefined;
    while (appMax) {
      await assertWritable();
      const apps = await MongoApp.find({
        teamId: teamObjectId,
        _id: { ...(appAfter ? { $gt: appAfter } : {}), $lte: appMax._id }
      })
        .sort({ _id: 1 })
        .limit(batchSize)
        .select('_id modules chatConfig')
        .lean<LegacyAppRow[]>();
      if (apps.length === 0) break;
      logBatch({ stage: 'scanned', resourceType: 'app', rows: apps });
      logBatch({ stage: 'replacing', resourceType: 'app', rows: apps });
      for (const app of apps) {
        counts.app.llm.scannedRecords++;
        counts.app.tts.scannedRecords++;
        counts.app.rerank.scannedRecords++;
        let lastChanges: Record<ModelKind, Change> | undefined;
        try {
          let current = app;
          for (let attempt = 0; attempt < 3; attempt++) {
            const normalizedWorkflow = migrateStoredWorkflow({
              nodes: current.modules,
              chatConfig: current.chatConfig
            });
            const next = replacer.replaceAppContent({
              nodes: current.modules,
              chatConfig: current.chatConfig,
              referenceNodes: normalizedWorkflow.nodes
            });
            lastChanges = next.changes;
            if (modelKinds.every((kind) => next.changes[kind].replacedReferences === 0)) {
              addChanges('app', next.changes, false);
              break;
            }
            await assertWritable();
            const written = await MongoApp.collection.updateOne(
              {
                _id: new Types.ObjectId(String(current._id)),
                teamId: teamObjectId,
                ...fieldMatch('modules', current.modules),
                ...fieldMatch('chatConfig', current.chatConfig)
              },
              {
                $set: {
                  ...(next.nodes !== undefined ? { modules: next.nodes } : {}),
                  ...(next.chatConfig !== undefined ? { chatConfig: next.chatConfig } : {})
                }
              }
            );
            if (written.modifiedCount > 0) {
              addChanges('app', next.changes, true);
              break;
            }
            if (attempt === 2) {
              for (const kind of modelKinds) {
                if (next.changes[kind].replacedReferences === 0) continue;
                counts.app[kind].conflicts++;
                counts.app[kind].failedRecords++;
              }
              addFailure('app', String(app._id), 'Concurrent update');
              break;
            }
            const refreshed = await MongoApp.findById(app._id)
              .select('_id modules chatConfig')
              .lean<LegacyAppRow>();
            if (!refreshed) break;
            current = refreshed;
          }
        } catch (error) {
          if (stopError) throw error;
          for (const kind of modelKinds) {
            if (!lastChanges || lastChanges[kind].replacedReferences > 0) {
              counts.app[kind].failedRecords++;
            }
          }
          addFailure('app', String(app._id), error instanceof Error ? error.name : 'Update failed');
        }

        let versionAfter: string | undefined;
        while (versionMax) {
          await assertWritable();
          const versions = await MongoAppVersion.find({
            appId: app._id,
            _id: { ...(versionAfter ? { $gt: versionAfter } : {}), $lte: versionMax._id }
          })
            .sort({ _id: 1 })
            .limit(batchSize)
            .select('_id appId nodes edges chatConfig resources resourceRefs')
            .lean<LegacyAppVersionRow[]>();
          if (versions.length === 0) break;
          logBatch({
            stage: 'scanned',
            resourceType: 'version',
            rows: versions,
            appId: String(app._id)
          });
          logBatch({
            stage: 'replacing',
            resourceType: 'version',
            rows: versions,
            appId: String(app._id)
          });
          for (const version of versions) {
            counts.version.llm.scannedRecords++;
            counts.version.tts.scannedRecords++;
            counts.version.rerank.scannedRecords++;
            let lastChanges: Record<ModelKind, Change> | undefined;
            try {
              let current = version;
              for (let attempt = 0; attempt < 3; attempt++) {
                const normalizedWorkflow = migrateStoredWorkflow({
                  nodes: current.nodes,
                  edges: current.edges,
                  chatConfig: current.chatConfig
                });
                const next = replacer.replaceAppContent({
                  nodes: current.nodes,
                  chatConfig: current.chatConfig,
                  referenceNodes: normalizedWorkflow.nodes
                });
                lastChanges = next.changes;
                if (modelKinds.every((kind) => next.changes[kind].replacedReferences === 0)) {
                  addChanges('version', next.changes, false);
                  break;
                }
                const storedResources = AppResourcesSchema.safeParse(current.resources);
                const resourcesToAppend: AppResourcesType = [];
                let resourcesToSet: AppResourcesType | undefined;
                if (storedResources.success) {
                  // 保留旧快照，只追加本次确实替换的模型，避免重算覆盖历史资源。
                  const existingResourceKeys = new Set(storedResources.data.map(getAppResourceKey));
                  for (const kind of modelKinds) {
                    if (next.changes[kind].replacedReferences === 0) continue;
                    const resource = replacementResources[kind];
                    const key = getAppResourceKey(resource);
                    if (existingResourceKeys.has(key)) continue;
                    existingResourceKeys.add(key);
                    resourcesToAppend.push(resource);
                  }
                  if (resourcesToAppend.length > 0) {
                    resourcesToSet = [...(current.resources ?? []), ...resourcesToAppend];
                  }
                }
                await assertWritable();
                const written = await MongoAppVersion.collection.updateOne(
                  {
                    _id: new Types.ObjectId(String(current._id)),
                    appId: new Types.ObjectId(String(app._id)),
                    ...fieldMatch('nodes', current.nodes),
                    ...fieldMatch('edges', current.edges),
                    ...fieldMatch('chatConfig', current.chatConfig),
                    ...fieldMatch('resources', current.resources),
                    ...fieldMatch('resourceRefs', current.resourceRefs)
                  },
                  {
                    $set: {
                      ...(next.nodes !== undefined ? { nodes: next.nodes } : {}),
                      ...(next.chatConfig !== undefined ? { chatConfig: next.chatConfig } : {}),
                      ...(resourcesToSet ? { resources: resourcesToSet } : {})
                    }
                  }
                );
                if (written.modifiedCount > 0) {
                  addChanges('version', next.changes, true);
                  break;
                }
                if (attempt === 2) {
                  for (const kind of modelKinds) {
                    if (next.changes[kind].replacedReferences === 0) continue;
                    counts.version[kind].conflicts++;
                    counts.version[kind].failedRecords++;
                  }
                  addFailure('version', String(version._id), 'Concurrent update');
                  break;
                }
                const refreshed = await MongoAppVersion.findById(version._id)
                  .select('_id appId nodes edges chatConfig resources resourceRefs')
                  .lean<LegacyAppVersionRow>();
                if (!refreshed || String(refreshed.appId) !== String(app._id)) break;
                current = refreshed;
              }
            } catch (error) {
              if (stopError) throw error;
              for (const kind of modelKinds) {
                if (!lastChanges || lastChanges[kind].replacedReferences > 0) {
                  counts.version[kind].failedRecords++;
                }
              }
              addFailure(
                'version',
                String(version._id),
                error instanceof Error ? error.name : 'Update failed'
              );
            }
          }
          logBatch({
            stage: 'replaced',
            resourceType: 'version',
            rows: versions,
            appId: String(app._id)
          });
          versionAfter = String(versions[versions.length - 1]._id);
        }
      }
      logBatch({ stage: 'replaced', resourceType: 'app', rows: apps });
      appAfter = String(apps[apps.length - 1]._id);
    }
  } catch (error) {
    logger.error('Invalid model replacement interrupted', {
      error,
      teamId
    });
    result.completed = false;
    result.stoppedReason = stopError ? 'conditions_changed' : 'scan_interrupted';
  }

  const totalCounts = Object.values(counts).flatMap((byModel) => Object.values(byModel));
  logger.info('Invalid model replacement finished', {
    teamId,
    completed: result.completed,
    stoppedReason: result.stoppedReason,
    scannedDatasets: counts.dataset.llm.scannedRecords,
    scannedApps: counts.app.llm.scannedRecords,
    scannedVersions: counts.version.llm.scannedRecords,
    replacedReferences: totalCounts.reduce((total, count) => total + count.replacedReferences, 0),
    failedRecords: totalCounts.reduce((total, count) => total + count.failedRecords, 0),
    failedSampleCount: failedSamples.length
  });
  return result;
};
