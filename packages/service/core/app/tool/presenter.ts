import type { localeType } from '@fastgpt/global/common/i18n/type';
import type { FlowNodeTemplateType } from '@fastgpt/global/core/workflow/type/node';
import { SystemToolRepo } from './systemTool/systemTool.repo';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum,
  FlowNodeOutputTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { Output_Template_Error_Message } from '@fastgpt/global/core/workflow/template/output';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';

/**
 * 获得工具的 Template 类型供工作流渲染
 */
export async function getToolPreviewNode({
  pluginId,
  versionId,
  lang = 'en',
  source: toolSource = 'system'
}: {
  pluginId: string;
  versionId?: string;
  lang?: localeType;
  source?: string;
}): Promise<FlowNodeTemplateType> {
  const systemToolRepo = SystemToolRepo.getInstance();
  const toolDetail = await systemToolRepo.getSystemToolDetail({
    pluginId,
    version: versionId,
    lang,
    source: toolSource
  });

  const inputs = [
    ...(toolDetail.secrets?.length
      ? [
          {
            key: NodeInputKeyEnum.systemInputConfig,
            label: '',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            inputList: toolDetail.secrets
          }
        ]
      : []),
    ...(toolDetail.inputs ?? [])
  ];
  const isWorkflowTool = !!toolDetail.associatedPluginId;

  return {
    id: getNanoid(),
    pluginId: pluginId,
    flowNodeType: isWorkflowTool
      ? FlowNodeTypeEnum.pluginModule
      : toolDetail.isToolSet
        ? FlowNodeTypeEnum.toolSet
        : FlowNodeTypeEnum.tool,
    avatar: toolDetail.avatar,
    name: toolDetail.name,
    intro: toolDetail.intro,
    toolDescription: toolDetail.toolDescription,
    courseUrl: toolDetail.courseUrl,
    userGuide: toolDetail.userGuide ?? undefined,
    showStatus: true,
    isTool: true,
    catchError: false,

    version: versionId, // 为 undefined 时，为保持最新版
    versionLabel: versionId,
    isLatestVersion: toolDetail.isLatestVersion,
    showSourceHandle: true,
    showTargetHandle: true,

    currentCost: toolDetail.currentCost,
    systemKeyCost: toolDetail.systemKeyCost,
    hasTokenFee: toolDetail.hasTokenFee,
    hasSystemSecret: toolDetail.hasSystemSecret,
    isFolder: !isWorkflowTool && toolDetail.isToolSet,
    status: toolDetail.status,
    inputs,

    outputs: toolDetail.outputs
      ? toolDetail.outputs.some((item) => item.type === FlowNodeOutputTypeEnum.error)
        ? toolDetail.outputs
        : [...toolDetail.outputs, Output_Template_Error_Message]
      : [],

    ...(isWorkflowTool
      ? {}
      : {
          toolConfig: {
            ...(toolDetail.isToolSet
              ? {
                  systemToolSet: {
                    toolId: pluginId,
                    toolList:
                      toolDetail.children?.map((child) => ({
                        description: child.description ?? '',
                        name: child.name,
                        toolId: child.id
                      })) ?? []
                  }
                }
              : {
                  systemTool: {
                    toolId: pluginId
                  }
                })
          }
        })
  } satisfies FlowNodeTemplateType;
}
