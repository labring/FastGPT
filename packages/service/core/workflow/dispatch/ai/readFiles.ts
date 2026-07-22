import { getErrText } from '@fastgpt/global/common/error/utils';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { i18nT } from '@fastgpt/global/common/i18n/utils';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import { getFileContentByUrl } from '../../../chat/fileContext';
import { getWorkflowFileContext } from '../../utils/context';
import { AgentNodeResponseDisplay } from './agentLoopCore/interface';

export type WorkflowReadFileItem = {
  name?: string;
  url: string;
};

type DispatchWorkflowReadFilesParams = {
  files: WorkflowReadFileItem[];
  teamId: string;
  tmbId: string;
  customPdfParse?: boolean;
  usageId?: string;
};

/**
 * 通过 Workflow 文件上下文批量解析模型提交的 URL。
 *
 * Context 命中的 URL 读取已授权私有对象；其余绝对 URL 作为运行期动态外链读取，
 * 不应用上传文件域名白名单，但仍保留 HTTP(S)、SSRF、重定向和文件大小限制。
 * 单文件失败不会中断同批其他文件，ToolCall 和 Agent 共用相同 JSON 与节点响应语义。
 */
export const dispatchWorkflowReadFiles = async ({
  files,
  teamId,
  tmbId,
  customPdfParse,
  usageId
}: DispatchWorkflowReadFilesParams) => {
  const usages: ChatNodeUsageType[] = [];
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
          name: inputName ?? name,
          content
        };
      } catch (error) {
        return {
          url,
          name: inputName ?? url,
          content: getErrText(error, 'Load file error')
        };
      }
    })
  );

  return {
    response: JSON.stringify(readFilesResult),
    usages,
    nodeResponse: {
      moduleType: FlowNodeTypeEnum.readFiles,
      moduleName: i18nT('chat:read_file'),
      moduleLogo: AgentNodeResponseDisplay.readFile.moduleLogo,
      readFiles: readFilesResult.map(({ name, url }) => ({ name, url }))
    }
  };
};
