import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import { getFileContentByUrl } from '../../../../../chat/fileContext';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { getLogger } from '@fastgpt-sdk/otel/logger';
import { LogCategories } from '../../../../../../common/logger';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { i18nT } from '@fastgpt/global/common/i18n/utils';
import {
  AgentNodeResponseDisplay,
  type AgentLoopCoreToolRunFlowResponse
} from '../../agentLoopCore/interface';
import { getWorkflowFileContext } from '../../../../utils/context';

const logger = getLogger(LogCategories.MODULE.AI.TOOL_CALL);

export const ReadFileToolDisplay = {
  name: {
    'zh-CN': '文件解析',
    en: 'File parse',
    'zh-Hant': '文件解析'
  },
  avatar: AgentNodeResponseDisplay.readFile.moduleLogo
};

type FileReadParams = {
  files: { name?: string; url: string }[];
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
  const getFlowResponse = (
    nodeResponse: Record<string, any> = {}
  ): AgentLoopCoreToolRunFlowResponse => ({
    flowResponses: [
      {
        ...nodeResponse,
        moduleType: FlowNodeTypeEnum.readFiles,
        moduleName: i18nT('chat:read_file'),
        moduleLogo: ReadFileToolDisplay.avatar,
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
      files.map(async ({ url, name: inputName }) => {
        try {
          const { name, content } = await getFileContentByUrl({
            url,
            teamId,
            tmbId,
            customPdfParse,
            usageId,
            fileContext: getWorkflowFileContext(),
            validateExternalUrlDomain: false
          });

          return {
            url,
            name: inputName || name,
            content
          };
        } catch (error) {
          return {
            url,
            name: inputName || url,
            content: getErrText(error, 'Load file error')
          };
        }
      })
    );

    // Stringify the result
    const response = readFilesResult
      .map(
        (file) => `<file>
<url>${file.url}</url>
<name>${file.name}</name>
<content>${file.content}</content>
</file>`
      )
      .join('\n');

    return {
      response,
      usages,
      flowResponse: getFlowResponse({
        readFiles: readFilesResult.map((file) => ({
          name: file.name,
          url: file.url
        }))
      })
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
