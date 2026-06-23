import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type { ModuleDispatchProps } from '@fastgpt/global/core/workflow/runtime/type';
import type { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { type DispatchNodeResultType } from '@fastgpt/global/core/workflow/runtime/type';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { type ChatItemMiniType } from '@fastgpt/global/core/chat/type';
import { getNodeErrResponse } from '../utils';
import { parseFileContentFromUrls } from '../../utils/file';
import { sliceStrStartEnd } from '@fastgpt/global/common/string/tools';

type Props = ModuleDispatchProps<{
  [NodeInputKeyEnum.fileUrlList]: string[];
}>;
type Response = DispatchNodeResultType<{
  [NodeOutputKeyEnum.text]: string;
  [NodeOutputKeyEnum.rawResponse]: { filename: string; url: string; text: string }[];
}>;

/**
 * 格式化 ReadFiles 节点已经读取出的文件正文。
 *
 * 这个输出会作为节点 text/toolResponse 传给后续节点，因此只描述“读取结果”，
 * 不复用对话上传文件 reminder，避免混入“可通过 read_files 再读取”的工具说明。
 */
export const buildReadFilesOutputText = (
  files: { id: string; name: string; content: string }[] = []
) => {
  if (files.length === 0) return '';

  return files.map((file) => `## ${file.name}\n${file.content}`).join('\n\n');
};

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
    const readFilesResult = await parseFileContentFromUrls({
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
      name: item.name,
      content: item.content
    }));

    const text = buildReadFilesOutputText(files);

    const getPreviewResponse = files
      .map((item) => `## ${item.name}\n${sliceStrStartEnd(item.content, 1000, 1000)}`)
      .join('\n\n');

    return {
      data: {
        [NodeOutputKeyEnum.text]: text,
        [NodeOutputKeyEnum.rawResponse]: readFilesResult.map((item) => ({
          filename: item.name,
          url: item.url,
          text: item.content
        }))
      },
      [DispatchNodeResponseKeyEnum.nodeResponse]: {
        readFiles: readFilesResult.map((item) => ({
          name: item.name,
          url: item.url
        })),
        readFilesResult: getPreviewResponse
      },
      [DispatchNodeResponseKeyEnum.toolResponse]: text
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
