import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { getChildAppPreviewNode, getSystemTools } from '@fastgpt/service/core/app/tool/controller';
import { getLocale } from '@fastgpt/service/common/middle/i18n';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { PluginErrEnum } from '@fastgpt/global/common/error/code/plugin';
import type {
  GetTeamToolDetailQueryType,
  GetTeamToolDetailResponseType
} from '@fastgpt/global/openapi/core/plugin/team/toolApi';
import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';

export type detailQuery = GetTeamToolDetailQueryType;

export type detailBody = {};

export type detailResponse = GetTeamToolDetailResponseType;

async function handler(
  req: ApiRequestProps<detailBody, detailQuery>,
  res: ApiResponseType<any>
): Promise<detailResponse> {
  const toolId = req.query.toolId;
  const lang = getLocale(req);

  await authCert({ req, authToken: true });

  const systemTools = await getSystemTools();

  const systemTool = systemTools.find((tool) => tool.id === toolId);

  if (!systemTool) {
    return Promise.reject(PluginErrEnum.unExist);
  }

  if (systemTool.associatedPluginId) {
    const actualTool = await getChildAppPreviewNode({
      appId: systemTool.associatedPluginId,
      versionId: systemTool.version,
      lang
    });

    return {
      tools: [
        {
          ...systemTool,
          name: parseI18nString(systemTool.name, lang),
          intro: parseI18nString(systemTool.intro, lang),
          icon: systemTool.avatar,
          versionList: [
            {
              inputs: actualTool.inputs.filter(
                (input) => input.key !== NodeInputKeyEnum.forbidStream
              ),
              outputs: actualTool.outputs.filter(
                (output) => output.key !== NodeOutputKeyEnum.errorText
              )
            }
          ]
        }
      ],
      downloadUrl: ''
    };
  }

  const childTools = systemTool.isFolder
    ? systemTools.filter((tool) => tool.parentId === systemTool.id)
    : [];

  return {
    tools: [systemTool, ...childTools].map((tool) => ({
      versionList: [],
      ...tool,
      name: parseI18nString(tool.name, lang),
      intro: parseI18nString(tool.intro, lang),
      icon: tool.avatar
    })),
    downloadUrl: ''
  };
}

export default NextAPI(handler);
