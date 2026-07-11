import { getErrText } from '@fastgpt/global/common/error/utils';
import { getFileContentByUrl } from '../../chat/fileContext';

type ReadAgentFilesParams = {
  files: { id: string; url: string }[];
  teamId: string;
  tmbId: string;
  customPdfParse?: boolean;
  usageId?: string;
};

/**
 * 读取 Agent 对话中的文档，并把单文件失败收敛为对应文件的可见结果。
 *
 * 调用层负责参数解析与响应协议；这里仅统一 workflow 和 auxiliaryGeneration
 * 对文件内容服务的调用及逐文件错误隔离。
 */
export const readAgentFiles = async ({
  files,
  teamId,
  tmbId,
  customPdfParse,
  usageId
}: ReadAgentFilesParams) =>
  Promise.all(
    files.map(async ({ id, url }) => {
      try {
        const { name, content } = await getFileContentByUrl({
          url,
          teamId,
          tmbId,
          customPdfParse,
          usageId
        });

        return { id, name, content };
      } catch (error) {
        return {
          id,
          name: '',
          content: getErrText(error, 'Load file error')
        };
      }
    })
  );
