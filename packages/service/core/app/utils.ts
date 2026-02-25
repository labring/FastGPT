import { MongoDataset } from '../dataset/schema';
import { getEmbeddingModel } from '../ai/model';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { getChildAppPreviewNode } from './tool/controller';
import { authAppByTmbId } from '../../support/permission/app/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { splitCombineToolId } from '@fastgpt/global/core/app/tool/utils';
import type { localeType } from '@fastgpt/global/common/i18n/type';
import type { SkillToolType } from '@fastgpt/global/core/ai/skill/type';

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
    vectorModel: getEmbeddingModel(item.vectorModel)
  }));
}

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

  /* Add node(App Type) versionlabel and latest sign ==== */
  await Promise.all(
    nodes.map(async (node) => {
      // Tool node(简易模式/工作流)
      if (node.pluginId) {
        const result = await loadToolNode({ id: node.pluginId, versionId: node.version });
        if (result.success) {
          const preview = result.data!;
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
              return {
                ...item,
                value: input?.value,
                selectedTypeIndex: input?.selectedTypeIndex
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
      }
    })
  );

  // Get all dataset ids from nodes
  nodes.forEach((node) => {
    if (node.flowNodeType !== FlowNodeTypeEnum.datasetSearchNode) return;

    const input = node.inputs.find((item) => item.key === NodeInputKeyEnum.datasetSelectList);
    if (!input) return;

    const rawValue = input.value as undefined | { datasetId: string }[] | { datasetId: string };
    if (!rawValue) return;

    const datasetIds = Array.isArray(rawValue)
      ? rawValue.map((v) => v?.datasetId).filter((id) => !!id && typeof id === 'string')
      : rawValue?.datasetId
        ? [String(rawValue.datasetId)]
        : [];

    datasetIds.forEach((id) => datasetIdSet.add(id));
  });

  if (datasetIdSet.size === 0) return;

  // Load dataset list
  const datasetList = await listAppDatasetDataByTeamIdAndDatasetIds({
    teamId: isRoot ? undefined : teamId,
    datasetIdList: Array.from(datasetIdSet)
  });
  const datasetMap = new Map(datasetList.map((ds) => [String(ds.datasetId), ds]));

  // Rewrite dataset ids, add dataset info to nodes
  if (datasetList.length > 0) {
    nodes.forEach((node) => {
      if (node.flowNodeType !== FlowNodeTypeEnum.datasetSearchNode) return;

      node.inputs.forEach((item) => {
        if (item.key !== NodeInputKeyEnum.datasetSelectList) return;

        const val = item.value as undefined | { datasetId: string }[] | { datasetId: string };

        if (Array.isArray(val)) {
          item.value = val
            .map((v) => {
              const data = datasetMap.get(String(v.datasetId));
              if (!data)
                return {
                  datasetId: v.datasetId,
                  avatar: '',
                  name: 'Dataset not found',
                  vectorModel: ''
                };
              return {
                datasetId: data.datasetId,
                avatar: data.avatar,
                name: data.name,
                vectorModel: data.vectorModel
              };
            })
            .filter(Boolean);
        } else if (typeof val === 'object' && val !== null) {
          const data = datasetMap.get(String(val.datasetId));
          if (!data) {
            item.value = [
              {
                datasetId: val.datasetId,
                avatar: '',
                name: 'Dataset not found',
                vectorModel: ''
              }
            ];
          } else {
            item.value = [
              {
                datasetId: data.datasetId,
                avatar: data.avatar,
                name: data.name,
                vectorModel: data.vectorModel
              }
            ];
          }
        }
      });
    });
  }

  return nodes;
}
