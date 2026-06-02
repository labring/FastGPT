import { MongoDataset } from '../dataset/schema';
import { getEmbeddingModel } from '../ai/model';
import { DatasetTypeEnum, DatasetTypeMap } from '@fastgpt/global/core/dataset/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { checkInputIsReference } from '@fastgpt/global/core/workflow/utils';
import { getChildAppPreviewNode } from './tool/controller';
import { authAppByTmbId } from '../../support/permission/app/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { splitCombineToolId } from '@fastgpt/global/core/app/tool/utils';
import type { localeType } from '@fastgpt/global/common/i18n/type';
import type { SkillToolType } from '@fastgpt/global/core/ai/skill/type';
import type {
  AppFormEditFormType,
  SelectedAgentSkillItemType
} from '@fastgpt/global/core/app/formEdit/type';
import { authSkillByTmbId } from '../../support/permission/skill/auth';
import type { SelectedDatasetType } from '@fastgpt/global/core/workflow/type/io';

export async function listAppDatasetDataByTeamIdAndDatasetIds({
  teamId,
  datasetIdList
}: {
  teamId?: string;
  datasetIdList: string[];
}) {
  const myDatasets = await MongoDataset.find({
    _id: { $in: datasetIdList },
    ...(teamId && { teamId })
  }).lean();

  return myDatasets.map((item) => ({
    datasetId: String(item._id),
    avatar: item.avatar,
    name: item.name,
    vectorModel: getEmbeddingModel(item.vectorModel),
    isDeleted: !!item.deleteTime
  }));
}

/**
 * 重写应用工作流节点，填充详细的元数据信息（如工具详情、技能详情、知识库详情）。
 */
export async function rewriteAppWorkflowToDetail({
  nodes,
  teamId,
  isRoot,
  ownerTmbId,
  lang
}: {
  nodes: StoreNodeItemType[];
  teamId: string;
  isRoot: boolean;
  ownerTmbId: string;
  lang?: localeType;
}) {
  const datasetIdSet = new Set<string>();
  type SelectedDatasetSnapshot = Pick<SelectedDatasetType, 'datasetId'> &
    Partial<SelectedDatasetType>;

  /**
   * 收集输入值中的数据集 ID 并添加到全局集合中。
   * 用于后续批量查询数据集元数据。
   * @param value - 保存阶段已压缩好的知识库选择数组，兼容历史单对象格式
   */
  const collectSelectedDatasetIds = (
    value?: SelectedDatasetSnapshot[] | SelectedDatasetSnapshot
  ) => {
    const datasetIds = Array.isArray(value)
      ? value.map((v) => v?.datasetId).filter((id) => !!id && typeof id === 'string')
      : value?.datasetId
        ? [String(value.datasetId)]
        : [];

    datasetIds.forEach((id) => datasetIdSet.add(id));
  };

  const loadToolNode = async ({ id, versionId }: { id: string; versionId?: string }) => {
    const { authAppId } = splitCombineToolId(id);

    try {
      const [preview] = await Promise.all([
        getChildAppPreviewNode({
          appId: id,
          versionId,
          lang
        }),
        ...(authAppId
          ? [
              authAppByTmbId({
                tmbId: ownerTmbId,
                appId: authAppId,
                per: ReadPermissionVal
              })
            ]
          : [])
      ]);

      return {
        success: true,
        data: preview
      };
    } catch (error) {
      return {
        success: false,
        error: getErrText(error)
      };
    }
  };

  const loadAgentSkill = async (
    selectedSkill: SelectedAgentSkillItemType
  ): Promise<SelectedAgentSkillItemType> => {
    try {
      const { skill } = await authSkillByTmbId({
        tmbId: ownerTmbId,
        skillId: selectedSkill.skillId,
        per: ReadPermissionVal,
        isRoot
      });

      return {
        skillId: String(skill._id),
        name: skill.name,
        description: skill.description,
        avatar: skill.avatar,
        isDeleted: false
      };
    } catch {
      return {
        ...selectedSkill,
        isDeleted: true
      };
    }
  };

  /* Add node(App Type) versionlabel and latest sign ==== */
  await Promise.all(
    nodes.map(async (node) => {
      // Tool node
      if (node.pluginId) {
        const result = await loadToolNode({ id: node.pluginId, versionId: node.version });
        if (result.success) {
          const preview = result.data!;
          node.avatar = preview.avatar ?? node.avatar;
          node.isFolder = preview.isFolder;
          node.pluginData = {
            name: preview.name,
            avatar: preview.avatar,
            status: preview.status,
            diagram: preview.diagram,
            userGuide: preview.userGuide,
            courseUrl: preview.courseUrl
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

            node.inputs = preview.inputs.map((item) => {
              const input = inputsMap.get(item.key);
              const selectedRenderType =
                input?.renderTypeList?.[input?.selectedTypeIndex ?? 0] ?? item.renderTypeList?.[0];
              const selectedTypeIndex = selectedRenderType
                ? item.renderTypeList.findIndex((renderType) => renderType === selectedRenderType)
                : -1;

              return {
                ...item,
                value: input?.value,
                selectedTypeIndex:
                  selectedTypeIndex >= 0 &&
                  (selectedTypeIndex > 0 || input?.selectedTypeIndex !== undefined)
                    ? selectedTypeIndex
                    : undefined
              };
            });
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
      // Agent, parse subapp
      if (node.flowNodeType === FlowNodeTypeEnum.agent) {
        const tools = (node.inputs.find((item) => item.key === NodeInputKeyEnum.selectedTools)
          ?.value || []) as SkillToolType[];
        const nodes = await Promise.all(
          tools.map(async (tool) => {
            const result = await loadToolNode({ id: tool.id });
            if (result.success) {
              const data = result.data!;
              // Merge saved config back into inputs
              const mergedInputs = data.inputs.map((input) => ({
                ...input,
                value:
                  tool.config && tool.config[input.key] !== undefined
                    ? tool.config[input.key] // Use saved config value
                    : input.value // Keep default value
              }));

              return {
                ...data,
                inputs: mergedInputs
              };
            } else {
              return {
                id: tool.id,
                templateType: 'personalTool' as const,
                flowNodeType: FlowNodeTypeEnum.tool,
                name: 'Invalid',
                avatar: '',
                intro: '',
                showStatus: false,
                weight: 0,
                isTool: true,
                version: 'v1',
                inputs: [],
                outputs: [],
                configStatus: 'invalid' as const,
                pluginData: {
                  error: result.error
                }
              };
            }
          })
        );
        node.inputs.forEach((input) => {
          if (input.key === NodeInputKeyEnum.selectedTools) {
            input.value = nodes;
          }
        });

        const skillsInput = node.inputs.find((item) => item.key === NodeInputKeyEnum.skills);
        const skills = (
          Array.isArray(skillsInput?.value) ? skillsInput!.value : []
        ) as SelectedAgentSkillItemType[];
        if (skillsInput && skills.length > 0) {
          skillsInput.value = await Promise.all(skills.map(loadAgentSkill));
        }
      }
    })
  );

  // Get all dataset ids from nodes
  nodes.forEach((node) => {
    if (
      node.flowNodeType !== FlowNodeTypeEnum.datasetSearchNode &&
      node.flowNodeType !== FlowNodeTypeEnum.agent
    )
      return;

    node.inputs.forEach((input) => {
      if (input.key === NodeInputKeyEnum.datasetSelectList && !checkInputIsReference(input)) {
        collectSelectedDatasetIds(input.value);
      }
      if (input.key === NodeInputKeyEnum.datasetParams) {
        collectSelectedDatasetIds(
          (input.value as AppFormEditFormType['dataset'] | undefined)?.datasets
        );
      }
    });
  });

  if (datasetIdSet.size === 0) return;

  // Load dataset list
  const datasetList = await listAppDatasetDataByTeamIdAndDatasetIds({
    teamId: isRoot ? undefined : teamId,
    datasetIdList: Array.from(datasetIdSet)
  });
  const datasetMap = new Map(datasetList.map((ds) => [String(ds.datasetId), ds]));
  const defaultDeletedDatasetAvatar = DatasetTypeMap[DatasetTypeEnum.dataset].avatar;

  /**
   * 格式化选中的数据集信息，补充元数据并标记删除状态
   * @param item - 待格式化的数据集选择项
   * @returns 包含完整信息（头像、名称、向量模型）及删除状态的数据集对象
   */
  const formatSelectedDataset = (item: SelectedDatasetSnapshot): SelectedDatasetType => {
    const data = datasetMap.get(String(item.datasetId));
    if (!data || data.isDeleted) {
      // 保存前会压缩成 { datasetId }，物理删除后没有快照时需要补齐合法占位。
      return {
        datasetId: item.datasetId,
        avatar: defaultDeletedDatasetAvatar,
        name: item.name || '',
        vectorModel: item.vectorModel || getEmbeddingModel(),
        isDeleted: true
      };
    }

    return {
      datasetId: data.datasetId,
      avatar: data.avatar,
      name: data.name,
      vectorModel: data.vectorModel,
      isDeleted: false
    };
  };

  /**
   * 标准化并格式化数据集选择值，补充元数据
   * @param value - 保存阶段已压缩好的知识库选择数组，兼容历史单对象格式
   * @returns 格式化后的数据集列表，包含完整信息及删除状态标记
   */
  const formatSelectedDatasetValue = (
    value?: SelectedDatasetSnapshot[] | SelectedDatasetSnapshot
  ): SelectedDatasetType[] | undefined => {
    if (!value) return;

    return Array.isArray(value) ? value.map(formatSelectedDataset) : [formatSelectedDataset(value)];
  };

  // Rewrite dataset ids, add dataset info to nodes
  nodes.forEach((node) => {
    if (
      node.flowNodeType !== FlowNodeTypeEnum.datasetSearchNode &&
      node.flowNodeType !== FlowNodeTypeEnum.agent
    ) {
      return;
    }

    node.inputs.forEach((item) => {
      if (item.key === NodeInputKeyEnum.datasetSelectList && !checkInputIsReference(item)) {
        const value = formatSelectedDatasetValue(item.value);
        if (value) {
          item.value = value;
        }
      }
      if (item.key === NodeInputKeyEnum.datasetParams) {
        const datasetParams = item.value as AppFormEditFormType['dataset'] | undefined;
        if (datasetParams?.datasets) {
          const datasets = formatSelectedDatasetValue(datasetParams.datasets);
          if (!datasets) return;

          item.value = {
            ...datasetParams,
            datasets
          };
        }
      }
    });
  });

  return nodes;
}
