import type { ChatCompletionTool } from '@fastgpt/global/core/ai/llm/type';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import { getFileContentByUrl } from '../../../../utils/file';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { getLogger } from '@fastgpt-sdk/otel/logger';
import { LogCategories } from '../../../../../../common/logger';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { i18nT } from '../../../../../../../web/i18n/utils';
import z from 'zod';
import type { ChildResponseItemType } from '../type';

const logger = getLogger(LogCategories.MODULE.AI.TOOL_CALL);

export const ReadFileTooData = {
  id: 'read_files',
  name: {
    'zh-CN': '文件解析',
    en: 'File parse',
    'zh-Hant': '文件解析'
  },
  avatar: 'core/workflow/template/readFiles'
};
export const ReadFileToolSchema: ChatCompletionTool = {
  type: 'function',
  function: {
    name: ReadFileTooData.id,
    description: '解析文件内容，获取文本。',
    parameters: {
      type: 'object',
      properties: {
        ids: { type: 'array', items: { type: 'string' } }
      },
      required: ['ids']
    }
  }
};

export const ReadFileToolParamsSchema = z.object({
  ids: z.array(z.string())
});
type FileReadParams = {
  files: { id: string; url: string }[];
  toolCallId: string;

  teamId: string;
  tmbId: string;
  customPdfParse?: boolean;
  usageId?: string;
};
export const dispatchReadFileTool = async ({
  files,
  toolCallId,
  teamId,
  tmbId,
  customPdfParse,
  usageId
}: FileReadParams) => {
  const startTime = Date.now();
  const usages: ChatNodeUsageType[] = [];
  const getFlowResponse = (nodeResponse: Record<string, any> = {}): ChildResponseItemType => ({
    flowResponses: [
      {
        ...nodeResponse,
        moduleType: FlowNodeTypeEnum.readFiles,
        moduleName: i18nT('chat:read_file'),
        moduleLogo: ReadFileTooData.avatar,
        id: toolCallId,
        nodeId: toolCallId,
        runningTime: +((Date.now() - startTime) / 1000).toFixed(2),
        totalPoints: usages.reduce((sum, item) => sum + item.totalPoints, 0)
      }
    ],
    flowUsages: usages,
    runTimes: 0
  });

  try {
    const readFilesResult = await Promise.all(
      files.map(async ({ url, id }) => {
        try {
          const { name, content } = await getFileContentByUrl({
            url,
            teamId,
            tmbId,
            customPdfParse,
            usageId
          });

          return {
            id,
            name,
            content
          };
        } catch (error) {
          return {
            id,
            name: url,
            content: getErrText(error, 'Load file error')
          };
        }
      })
    );

    // Stringify the result
    const response = readFilesResult
      .map(
        (file) => `<file>
<id>${file.id}</id>
<content>${file.content}</content>
</file>`
      )
      .join('\n');

    return {
      response,
      usages,
      flowResponse: getFlowResponse()
    };
  } catch (error) {
    logger.error('[File Read] Compression failed, using original content', { error });
    const response = `Failed to read file: ${getErrText(error)}`;
    const nodeResponse = {
      errorText: response
    };

    return {
      response,
      usages,
      flowResponse: getFlowResponse(nodeResponse)
    };
  }
};
