import { MongoDataset } from '../dataset/schema';
import { getEmbeddingModel } from '../ai/model';
import { DatasetTypeEnum, DatasetTypeMap } from '@fastgpt/global/core/dataset/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { nodeInputIsReference } from '@fastgpt/global/core/workflow/utils';
import { getChildAppPreviewNode } from './tool/controller';
import { authAppByTmbId } from '../../support/permission/app/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { splitCombineToolId } from '@fastgpt/global/core/app/tool/utils';
import type { localeType } from '@fastgpt/global/common/i18n/type';
import { SkillToolSchema } from '@fastgpt/global/core/ai/skill/type';
import {
  SelectedAgentSkillItemTypeSchema,
  type AppFormEditFormType,
  type SelectedAgentSkillItemType
} from '@fastgpt/global/core/app/formEdit/type';
import { authSkillByTmbId } from '../../support/permission/skill/auth';
import type { SelectedDatasetType } from '@fastgpt/global/core/workflow/type/io';
import z from 'zod';

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
  type SelectedDatasetSnapshot = Pick<SelectedDatasetType, 'datasetId'> &
    Partial<SelectedDatasetType>;
  const defaultDeletedDatasetAvatar = DatasetTypeMap[DatasetTypeEnum.dataset].avatar;

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
                per: ReadPermissionVal,
                isRoot
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
  const formatSelectedDatasetValue = async (
    value?: SelectedDatasetSnapshot[] | SelectedDatasetSnapshot
  ): Promise<SelectedDatasetType[] | undefined> => {
    const loadDatasetInfo = async (
      snapshot: SelectedDatasetSnapshot
    ): Promise<SelectedDatasetType> => {
      const datasetId = String(snapshot.datasetId);
      const dataset = await MongoDataset.findOne({
        _id: datasetId,
        ...(!isRoot && teamId && { teamId })
      }).lean();

      if (dataset && !dataset.deleteTime) {
        return {
          datasetId: String(dataset._id),
          avatar: dataset.avatar,
          name: dataset.name,
          vectorModel: getEmbeddingModel(dataset.vectorModel),
          isDeleted: false
        };
      }

      // 保存前会压缩成 { datasetId }，软删除或物理删除后没有快照时需要补齐合法占位。
      return {
        datasetId,
        avatar: defaultDeletedDatasetAvatar,
        name: snapshot.name || '',
        vectorModel: snapshot.vectorModel || getEmbeddingModel(),
        isDeleted: true
      };
    };

    if (!value) return;
    const datasets = Array.isArray(value) ? value : [value];
    return Promise.all(datasets.map(loadDatasetInfo));
  };

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
                renderTypeList: input?.renderTypeList ?? item.renderTypeList,
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
        // Tool load
        const toolInput = node.inputs.find((item) => item.key === NodeInputKeyEnum.selectedTools);
        if (toolInput && !nodeInputIsReference(toolInput)) {
          const toolsParse = z.array(SkillToolSchema).safeParse(toolInput?.value || []);
          const tools = toolsParse.success ? toolsParse.data : [];
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
          toolInput.value = nodes;
        }

        // Skill load
        const skillsInput = node.inputs.find((item) => item.key === NodeInputKeyEnum.skills);
        if (skillsInput && !nodeInputIsReference(skillsInput)) {
          const skillParse = z
            .array(SelectedAgentSkillItemTypeSchema)
            .safeParse(skillsInput.value || []);
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
