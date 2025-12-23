import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import {
  GetAiSkillDetailQuery,
  GetAiSkillDetailResponseSchema,
  type GetAiSkillDetailQueryType,
  type GetAiSkillDetailResponse
} from '@fastgpt/global/openapi/core/ai/skill/api';
import { MongoAiSkill } from '@fastgpt/service/core/ai/skill/schema';
import { authApp, authAppByTmbId } from '@fastgpt/service/support/permission/app/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { getChildAppPreviewNode } from '@fastgpt/service/core/app/tool/controller';
import { getLocale } from '@fastgpt/service/common/middle/i18n';
import type { SelectedToolItemType } from '@fastgpt/global/core/app/formEdit/type';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { getErrText, UserError } from '@fastgpt/global/common/error/utils';
import { splitCombineToolId } from '@fastgpt/global/core/app/tool/utils';
import { AppToolSourceEnum } from '@fastgpt/global/core/app/tool/constants';

async function handler(
  req: ApiRequestProps<{}, GetAiSkillDetailQueryType>,
  res: ApiResponseType<any>
): Promise<GetAiSkillDetailResponse> {
  const { id } = GetAiSkillDetailQuery.parse(req.query);

  // First, find the skill to get appId
  const skill = await MongoAiSkill.findById(id).lean();
  if (!skill) {
    return Promise.reject(new UserError('AI skill not found'));
  }

  // Auth app with read permission
  const { teamId, app } = await authApp({
    req,
    appId: String(skill.appId),
    per: ReadPermissionVal,
    authToken: true
  });

  // Verify team ownership
  if (String(skill.teamId) !== teamId) {
    return Promise.reject(new UserError('AI skill not found or access denied'));
  }

  // Get full tool data using getChildAppPreviewNode
  const expandedTools: SelectedToolItemType[] = await Promise.all(
    (skill.tools || []).map(async (tool) => {
      try {
        const { source, pluginId } = splitCombineToolId(tool.id);

        const [toolNode] = await Promise.all([
          getChildAppPreviewNode({
            appId: pluginId,
            lang: getLocale(req)
          }),
          ...(source === AppToolSourceEnum.personal
            ? [
                authAppByTmbId({
                  tmbId: app.tmbId,
                  appId: pluginId,
                  per: ReadPermissionVal
                })
              ]
            : [])
        ]);

        // Merge saved config back into inputs
        const mergedInputs = toolNode.inputs.map((input) => ({
          ...input,
          value:
            tool.config && tool.config[input.key] !== undefined
              ? tool.config[input.key] // Use saved config value
              : input.value // Keep default value
        }));

        return {
          ...toolNode,
          id: toolNode.pluginId!,
          inputs: mergedInputs
        };
      } catch (error) {
        // If tool not found or error, mark as invalid
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
            error: getErrText(error)
          }
        };
      }
    })
  );

  return GetAiSkillDetailResponseSchema.parse({
    ...skill,
    tools: expandedTools
  });
}

export default NextAPI(handler);
