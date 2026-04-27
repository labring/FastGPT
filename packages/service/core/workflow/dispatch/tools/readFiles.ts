import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type { ModuleDispatchProps } from '@fastgpt/global/core/workflow/runtime/type';
import type { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { type DispatchNodeResultType } from '@fastgpt/global/core/workflow/runtime/type';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { type ChatItemMiniType } from '@fastgpt/global/core/chat/type';
import { getNodeErrResponse } from '../utils';
import { getFileContentFromLinks } from '../../utils/file';
import { getUserFilesPrompt } from '../../../ai/llm/agentLoop/prompt';
import { sliceStrStartEnd } from '@fastgpt/global/common/string/tools';

type Props = ModuleDispatchProps<{
  [NodeInputKeyEnum.fileUrlList]: string[];
}>;
type Response = DispatchNodeResultType<{
  [NodeOutputKeyEnum.text]: string;
  [NodeOutputKeyEnum.rawResponse]: { filename: string; url: string; text: string }[];
}>;

export const dispatchReadFiles = async (props: Props): Promise<Response> => {
  const {
    requestOrigin,
    runningUserInfo: { teamId, tmbId },
    histories,
    chatConfig,
    node: { version },
    params: { fileUrlList = [] },
    usageId
  } = props;
  const maxFiles = chatConfig?.fileSelectConfig?.maxFiles || 20;
  const customPdfParse = chatConfig?.fileSelectConfig?.customPdfParse || false;

  // Get files from histories
  const filesFromHistories = version !== '489' ? [] : getHistoryFileLinks(histories);

  try {
    const readFilesResult = await getFileContentFromLinks({
      // Concat fileUrlList and filesFromHistories; remove not supported files
      urls: [...fileUrlList, ...filesFromHistories],
      requestOrigin,
      maxFiles,
      teamId,
      tmbId,
      customPdfParse,
      usageId
    });
    const files = readFilesResult.map((item, index) => ({
      id: `${index}`,
      name: item.filename,
      content: item.content
    }));

    const text = getUserFilesPrompt(files);

    const getPreviewResponse = files
      .map((item) => `## ${item.name}\n${sliceStrStartEnd(item.content, 1000, 1000)}`)
      .join('\n\n');

    return {
      data: {
        [NodeOutputKeyEnum.text]: text,
        [NodeOutputKeyEnum.rawResponse]: readFilesResult.map((item) => ({
          filename: item.filename,
          url: item.url,
          text: item.content
        }))
      },
      [DispatchNodeResponseKeyEnum.nodeResponse]: {
        readFiles: readFilesResult.map((item) => ({
          name: item.filename,
          url: item.url
        })),
        readFilesResult: getPreviewResponse
      },
      [DispatchNodeResponseKeyEnum.toolResponses]: {
        fileContent: text
      }
    };
  } catch (error) {
    return getNodeErrResponse({ error });
  }
};

export const getHistoryFileLinks = (histories: ChatItemMiniType[]) => {
  return histories
    .filter((item) => {
      if (item.obj === ChatRoleEnum.Human) {
        return item.value.some((value) => value.file);
      }
      return false;
    })
    .flatMap((item) => {
      if (item.obj === ChatRoleEnum.Human) {
        return item.value.map((value) => value.file?.url).filter(Boolean) as string[];
      }
      return [];
    });
};
