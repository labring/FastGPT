import { MongoDataset } from '../dataset/schema';
import { getDefaultEmbeddingModelData } from '../ai/model';
import { desensitizeSystemModel } from '../ai/config/utils';
import { getDatasetEmbeddingModel } from '../dataset/model';
import { DatasetTypeEnum, DatasetTypeMap } from '@fastgpt/global/core/dataset/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import {
  nodeInputIsReference,
  projectExternalVariableInput
} from '@fastgpt/global/core/workflow/utils';
import {
  initAgentToolInputType,
  normalizeFlowNodeInputType
} from '@fastgpt/global/core/app/formEdit/utils';
import { getClientToolPreviewNode } from './tool/utils/client';
import { authAppByTmbId } from '../../support/permission/app/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { getErrText } from '@fastgpt/global/common/error/utils';
import {
  isSystemOrCommercialToolId,
  splitCombineToolId
} from '@fastgpt/global/core/app/tool/utils';
import { AgentToolInputModeEnum } from '@fastgpt/global/core/app/tool/constants';
import type { localeType } from '@fastgpt/global/common/i18n/type';
import { AgentToolSchema } from '@fastgpt/global/core/app/tool/type';
import {
  SelectedAgentSkillItemTypeSchema,
  StoredSelectedAgentSkillItemTypeSchema,
  type AppFormEditFormType,
  type StoredSelectedAgentSkillItemType,
  type SelectedAgentSkillItemType
} from '@fastgpt/global/core/app/formEdit/type';
import { authSkillByTmbId } from '../../support/permission/skill/auth';
import { MongoAgentSkills } from '../ai/skill/model/schema';
import { AgentSkillSourceEnum } from '@fastgpt/global/core/ai/skill/constants';
import { SkillErrEnum } from '@fastgpt/global/common/error/code/skill';
import { authDatasetByTmbId } from '../../support/permission/dataset/auth';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { getAppResourceKey, normalizeAppToolResource } from './resources';
import type {
  FlowNodeInputItemType,
  SelectedDatasetType
} from '@fastgpt/global/core/workflow/type/io';
import type { AppResourcesType } from '@fastgpt/global/core/app/type';
import { formatToolInputSecrets } from './tool/secretConfig';
import z from 'zod';

type DetailWorkflowNode = StoreNodeItemType;

/**
 * 重写应用工作流节点，填充详细的元数据信息（如工具详情、技能详情、知识库详情）。
 */
export async function rewriteAppWorkflowToDetail({
  nodes,
  teamId,
  isRoot,
  ownerTmbId,
  viewerTmbId,
  lang,
  resources = []
}: {
  nodes: DetailWorkflowNode[];
  teamId: string;
  isRoot: boolean;
  ownerTmbId: string;
  /** 当前请求操作者；仅对快照外新增资源做 UI 侧权限提示。 */
  viewerTmbId?: string;
  lang?: localeType;
  resources?: AppResourcesType;
}) {
  // 快照内资源属于已确认的历史基线，不使用当前操作者或应用 owner 重新鉴权。
  const snapshotResourceKeys = new Set(resources.map(getAppResourceKey));
  const hasSnapshotResource = (type: 'agent' | 'tool' | 'dataset' | 'skill', id: string) =>
    snapshotResourceKeys.has(getAppResourceKey({ type, id }));
  type SelectedDatasetSnapshot = Pick<SelectedDatasetType, 'datasetId'> &
    Partial<SelectedDatasetType>;
  const defaultDeletedDatasetAvatar = DatasetTypeMap[DatasetTypeEnum.dataset].avatar;

  const loadToolNode = async ({
    id,
    versionId,
    source,
    resourceType = 'tool'
  }: {
    id: string;
    versionId?: string;
    source?: string;
    resourceType?: 'agent' | 'tool';
  }) => {
    try {
      const preview = await getClientToolPreviewNode({
        appId: id,
        versionId,
        lang,
        source,
        teamId
      });

      const normalizedResource = normalizeAppToolResource(id);
      const resourceInSnapshot =
        !!normalizedResource && hasSnapshotResource(resourceType, normalizedResource.id);
      let permissionDenied = false;

      // 快照外资源需要用当前操作者做一次提示性鉴权；正式发布仍由服务端差量校验兜底。
      if ((viewerTmbId && !resourceInSnapshot) || isRoot) {
        let authAppId: string | undefined;
        try {
          authAppId = splitCombineToolId(id).authAppId;
        } catch {
          // malformed id 交给预览加载结果处理，不能让详情接口直接失败。
        }
        if (authAppId) {
          try {
            await authAppByTmbId({
              tmbId: viewerTmbId ?? ownerTmbId,
              appId: authAppId,
              per: ReadPermissionVal,
              isRoot
            });
          } catch {
            permissionDenied = true;
          }
        }
      }

      return {
        success: true,
        data: preview,
        permissionDenied
      };
    } catch (error) {
      return {
        success: false,
        error: getErrText(error, '', lang)
      };
    }
  };
  type AgentSkillSnapshot = StoredSelectedAgentSkillItemType & Partial<SelectedAgentSkillItemType>;
  const AgentSkillSnapshotSchema = SelectedAgentSkillItemTypeSchema.partial().extend({
    skillId: StoredSelectedAgentSkillItemTypeSchema.shape.skillId
  });

  const loadAgentSkill = async (
    selectedSkill: AgentSkillSnapshot
  ): Promise<SelectedAgentSkillItemType> => {
    const skillId = String(selectedSkill.skillId);
    const resourceInSnapshot = hasSnapshotResource('skill', skillId);
    try {
      const skill =
        viewerTmbId && !resourceInSnapshot
          ? (
              await authSkillByTmbId({
                tmbId: viewerTmbId,
                skillId,
                per: ReadPermissionVal,
                isRoot
              })
            ).skill
          : await MongoAgentSkills.findOne({
              _id: skillId,
              deleteTime: null,
              ...(isRoot ? {} : { $or: [{ teamId }, { source: AgentSkillSourceEnum.system }] })
            }).lean();

      if (!skill) throw SkillErrEnum.unExist;

      return {
        skillId: String(skill._id),
        name: skill.name,
        description: skill.description,
        avatar: skill.avatar,
        isDeleted: false,
        permissionDenied: false
      };
    } catch (error) {
      const permissionDenied = error === SkillErrEnum.unAuthSkill;
      return {
        skillId: selectedSkill.skillId,
        name: selectedSkill.name ?? 'Invalid',
        description: selectedSkill.description ?? '',
        avatar: selectedSkill.avatar,
        isDeleted: !permissionDenied,
        permissionDenied
      };
    }
  };
  type ToolInputSnapshot = Pick<FlowNodeInputItemType, 'key' | 'renderTypeList'> &
    Partial<FlowNodeInputItemType>;

  const mergeToolInputDetail = ({
    previewInput,
    savedInput
  }: {
    previewInput: FlowNodeInputItemType;
    savedInput?: ToolInputSnapshot;
  }) => {
    const hasSavedValue = !!savedInput && Object.prototype.hasOwnProperty.call(savedInput, 'value');
    const renderTypeList = Array.from(
      new Set([...(savedInput?.renderTypeList ?? []), ...previewInput.renderTypeList])
    );
    const normalizedInput = normalizeFlowNodeInputType(
      {
        ...previewInput,
        renderTypeList,
        selectedType: savedInput?.selectedType,
        defaultToAgentGenerated:
          savedInput?.defaultToAgentGenerated ?? previewInput.defaultToAgentGenerated,
        toolDescription: savedInput?.toolDescription ?? previewInput.toolDescription
      },
      { deferDefaultSelection: true }
    );

    return projectExternalVariableInput({
      ...normalizedInput,
      value: hasSavedValue ? savedInput.value : normalizedInput.value
    });
  };
  const formatSelectedDatasetValue = async (
    value?: SelectedDatasetSnapshot[] | SelectedDatasetSnapshot
  ): Promise<SelectedDatasetType[] | undefined> => {
    const loadDatasetInfo = async (
      snapshot: SelectedDatasetSnapshot
    ): Promise<SelectedDatasetType> => {
      const datasetId = String(snapshot.datasetId);
      const resourceInSnapshot = hasSnapshotResource('dataset', datasetId);
      let dataset;
      let permissionDenied = false;

      try {
        dataset =
          viewerTmbId && !resourceInSnapshot
            ? (
                await authDatasetByTmbId({
                  tmbId: viewerTmbId,
                  datasetId,
                  per: ReadPermissionVal,
                  isRoot
                })
              ).dataset
            : await MongoDataset.findOne({
                _id: datasetId,
                ...(!isRoot && teamId && { teamId })
              }).lean();
      } catch (error) {
        permissionDenied = error === DatasetErrEnum.unAuthDataset;
      }

      if (dataset && !dataset.deleteTime) {
        return {
          datasetId: String(dataset._id),
          avatar: dataset.avatar,
          name: dataset.name,
          vectorModel: getDatasetEmbeddingModel(dataset),
          isDeleted: false,
          permissionDenied
        };
      }

      // 保存前会压缩成 { datasetId }，软删除或物理删除后没有快照时需要补齐合法占位。
      return {
        datasetId,
        avatar: defaultDeletedDatasetAvatar,
        name: snapshot.name || '',
        vectorModel: snapshot.vectorModel || desensitizeSystemModel(getDefaultEmbeddingModelData()),
        isDeleted: !permissionDenied,
        ...(permissionDenied ? { permissionDenied: true } : {})
      };
    };

    if (!value) return;
    const datasets = Array.isArray(value) ? value : [value];
    return Promise.all(datasets.map(loadDatasetInfo));
  };

  await Promise.all(
    nodes.map(async (node) => {
      if (node.flowNodeType !== FlowNodeTypeEnum.pluginInput) {
        node.inputs = node.inputs.map((input) =>
          normalizeFlowNodeInputType(input, { deferDefaultSelection: true })
        );
      }

      // Tool node
      if (node.pluginId) {
        const result = await loadToolNode({
          id: node.pluginId,
          versionId: node.version ?? '',
          resourceType: node.flowNodeType === FlowNodeTypeEnum.appModule ? 'agent' : 'tool',
          source:
            node.source ??
            node.toolConfig?.systemTool?.source ??
            node.toolConfig?.systemToolSet?.source
        });
        if (result.success) {
          const preview = result.data!;
          node.source = preview.source ?? node.source;
          node.avatar = preview.avatar ?? node.avatar;
          node.isFolder = preview.isFolder;
          node.pluginData = {
            name: preview.name,
            avatar: preview.avatar,
            status: preview.status,
            diagram: preview.diagram,
            userGuide: preview.userGuide,
            courseUrl: preview.courseUrl,
            readmeUrl: preview.readmeUrl,
            ...(result.permissionDenied ? { permissionDenied: true } : {})
          };
          node.versionLabel = preview.versionLabel;
          node.isLatestVersion = preview.isLatestVersion;
          node.version = preview.version;

          node.currentCost = preview.currentCost;
          node.systemKeyCost = preview.systemKeyCost;
          node.hasTokenFee = preview.hasTokenFee;
          node.hasSystemSecret = preview.hasSystemSecret;

          node.toolConfig = preview.toolConfig;
          node.toolDescription = preview.toolDescription;

          // Latest version
          if (!node.version) {
            const inputsMap = new Map(node.inputs.map((item) => [item.key, item]));
            const outputsMap = new Map(node.outputs.map((item) => [item.key, item]));

            node.inputs = preview.inputs.map((item) =>
              mergeToolInputDetail({
                previewInput: item,
                savedInput: inputsMap.get(item.key)
              })
            );
            node.outputs = preview.outputs.map((item) => {
              const output = outputsMap.get(item.key);
              return {
                ...item,
                value: output?.value
              };
            });
          }
        } else {
          node.pluginData = {
            error: result.error
          };
        }
      }
      // 只有子应用节点消费外部变量；当前工作流入口和其他节点保留原始输入定义。
      if (
        node.flowNodeType === FlowNodeTypeEnum.appModule ||
        node.flowNodeType === FlowNodeTypeEnum.pluginModule
      ) {
        node.inputs = node.inputs.map(projectExternalVariableInput);
      }
      // Agent, parse subapp
      if (node.flowNodeType === FlowNodeTypeEnum.agent) {
        // Tool load
        const toolInput = node.inputs.find((item) => item.key === NodeInputKeyEnum.selectedTools);
        if (toolInput && !nodeInputIsReference(toolInput)) {
          const tools = Array.isArray(toolInput.value)
            ? toolInput.value.flatMap((value) => {
                const result = AgentToolSchema.safeParse(value);
                return result.success ? [result.data] : [];
              })
            : [];
          const toolNodes = await Promise.all(
            tools.map(async (tool) => {
              const result = await loadToolNode({
                id: tool.id,
                versionId: tool.version,
                source: tool.source,
                resourceType: 'tool'
              });
              if (result.success) {
                const data = result.data!;
                // Merge saved config back into inputs
                const savedToolInputs = tool.inputs ?? [];
                const hasMissingToolInputs = tool.inputs === undefined;
                const toolInputConfigMap = new Map(
                  savedToolInputs.map((input) => [input.key, input])
                );
                const mergedInputs = data.inputs.map((input) => {
                  const savedMode = toolInputConfigMap.get(input.key)?.mode;
                  const mode =
                    (Object.values(AgentToolInputModeEnum).includes(
                      savedMode as AgentToolInputModeEnum
                    )
                      ? (savedMode as AgentToolInputModeEnum)
                      : undefined) ??
                    (hasMissingToolInputs &&
                    (isSystemOrCommercialToolId(tool.id) ||
                      (data.flowNodeType === FlowNodeTypeEnum.pluginModule &&
                        !!input.toolDescription))
                      ? AgentToolInputModeEnum.agentGenerated
                      : undefined);
                  const inputWithTypeConfig = initAgentToolInputType({
                    input,
                    mode
                  });

                  return {
                    ...inputWithTypeConfig,
                    value:
                      tool.config && tool.config[input.key] !== undefined
                        ? tool.config[input.key] // Use saved config value
                        : inputWithTypeConfig.value // Keep default value
                  };
                });

                formatToolInputSecrets({ inputs: mergedInputs });

                return {
                  ...data,
                  source: tool.source ?? data.source,
                  toolConfig: tool.toolConfig ?? data.toolConfig,
                  ...(result.permissionDenied
                    ? { pluginData: { ...data.pluginData, permissionDenied: true } }
                    : {}),
                  inputs: mergedInputs
                };
              } else {
                return {
                  id: tool.id,
                  pluginId: tool.id,
                  source: tool.source,
                  version: tool.version ?? '',
                  toolConfig: tool.toolConfig,
                  config: tool.config ?? {},
                  inputs: tool.inputs ?? [],
                  templateType: 'personalTool' as const,
                  flowNodeType: FlowNodeTypeEnum.tool,
                  name: 'Invalid',
                  avatar: '',
                  intro: '',
                  showStatus: false,
                  weight: 0,
                  isTool: true,
                  outputs: [],
                  configStatus: 'invalid' as const,
                  pluginData: {
                    error: result.error
                  }
                };
              }
            })
          );
          toolInput.value = toolNodes.filter((tool): tool is NonNullable<typeof tool> => !!tool);
        }

        // Skill load
        const skillsInput = node.inputs.find((item) => item.key === NodeInputKeyEnum.skills);
        if (skillsInput && !nodeInputIsReference(skillsInput)) {
          const skillParse = z.array(AgentSkillSnapshotSchema).safeParse(skillsInput.value || []);
          const skills = skillParse.success ? skillParse.data : [];
          if (skills.length > 0) {
            skillsInput.value = await Promise.all(skills.map(loadAgentSkill));
          }
        }
      }
      // Dataset load
      if (
        node.flowNodeType === FlowNodeTypeEnum.datasetSearchNode ||
        node.flowNodeType === FlowNodeTypeEnum.agent
      ) {
        await Promise.all(
          node.inputs.map(async (input) => {
            if (nodeInputIsReference(input)) return;
            // Agent
            if (input.key === NodeInputKeyEnum.datasetSelectList) {
              const datasets = await formatSelectedDatasetValue(input.value);
              if (datasets) {
                input.value = datasets;
              }
            }
            // workflow
            if (input.key === NodeInputKeyEnum.datasetParams) {
              const datasetParams = input.value as AppFormEditFormType['dataset'] | undefined;
              if (datasetParams?.datasets) {
                const datasets = await formatSelectedDatasetValue(datasetParams.datasets);
                if (!datasets) return;

                input.value = {
                  ...datasetParams,
                  datasets
                };
              }
            }
          })
        );
      }
    })
  );

  return nodes;
}
