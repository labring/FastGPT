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
import {
  jsonSchema2NodeInput,
  jsonSchema2NodeOutput,
  jsonSchema2SecretInput
} from '@fastgpt/global/core/app/jsonschema';

/**
 * 获得工具的 Template 类型供工作流渲染
 */
export async function getToolPreviewNode({
  pluginId,
  versionId,
  getLatestVersion,
  lang = 'en',
  source: toolSource = 'system'
}: {
  pluginId: string;
  versionId?: string;
  getLatestVersion?: boolean;
  lang?: localeType;
  source?: string;
}): Promise<FlowNodeTemplateType> {
  const systemToolRepo = SystemToolRepo.getInstance();
  const toolDetail = await systemToolRepo.getSystemToolDetail({
    pluginId,
    version: versionId || undefined,
    lang,
    source: toolSource
  });
  const shouldReturnVersion = versionId ? true : versionId === undefined && getLatestVersion;
  const secrets = jsonSchema2SecretInput({ jsonSchema: toolDetail.secretSchema });
  const schemaInputs = jsonSchema2NodeInput({
    jsonSchema: toolDetail.inputSchema,
    schemaType: 'systemTool'
  });
  const schemaOutputs = jsonSchema2NodeOutput({ jsonSchema: toolDetail.outputSchema });

  const inputs = [
    ...(secrets?.length
      ? [
          {
            key: NodeInputKeyEnum.systemInputConfig,
            label: '',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            inputList: secrets
          }
        ]
      : []),
    ...schemaInputs
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
    readmeUrl: toolDetail.readmeUrl,
    userGuide: toolDetail.userGuide ?? undefined,
    showStatus: true,
    isTool: true,
    catchError: false,

    version: shouldReturnVersion ? toolDetail.version : '',
    versionLabel: shouldReturnVersion ? (toolDetail.versionLabel ?? toolDetail.version) : undefined,
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

    outputs: schemaOutputs
      ? schemaOutputs.some((item) => item.type === FlowNodeOutputTypeEnum.error)
        ? schemaOutputs
        : [...schemaOutputs, Output_Template_Error_Message]
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
