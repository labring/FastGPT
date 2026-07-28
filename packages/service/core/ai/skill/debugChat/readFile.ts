import { getErrText } from '@fastgpt/global/common/error/utils';
import type { AgentLoopReadFileExecutor } from '../../llm/agentLoop/interface';
import { ReadFilesToolParamsSchema } from '../../llm/agentLoop/interface';
import { parseJsonArgs } from '../../utils';
import { getFileContentByUrl } from '../../../chat/fileContext';

/** 创建只允许读取当前聊天附件的 Skill Debug read_files executor。 */
export const createSkillDebugReadFileExecutor = ({
  readableFileUrls,
  maxFileAmount,
  teamId,
  tmbId,
  customPdfParse,
  usageId
}: {
  readableFileUrls: string[];
  maxFileAmount: number;
  teamId: string;
  tmbId: string;
  customPdfParse?: boolean;
  usageId: string;
}): AgentLoopReadFileExecutor => {
  const readableFileUrlSet = new Set(readableFileUrls);

  return async ({ call }) => {
    const parsedParams = ReadFilesToolParamsSchema.safeParse(
      parseJsonArgs(call.function.arguments)
    );
    if (!parsedParams.success) {
      return {
        response: parsedParams.error.message,
        usages: [],
        error: parsedParams.error
      };
    }

    const requestedUrls = parsedParams.data.urls.slice(0, maxFileAmount);
    const files = await Promise.all(
      requestedUrls.map(async (url) => {
        if (!readableFileUrlSet.has(url)) {
          return {
            url,
            name: '',
            content: 'File is not available in the current chat context.'
          };
        }

        try {
          const { name, content } = await getFileContentByUrl({
            url,
            teamId,
            tmbId,
            customPdfParse,
            usageId
          });
          return { url, name, content };
        } catch (error) {
          return {
            url,
            name: '',
            content: getErrText(error, 'Load file error')
          };
        }
      })
    );

    return {
      response: JSON.stringify(files),
      usages: []
    };
  };
};
