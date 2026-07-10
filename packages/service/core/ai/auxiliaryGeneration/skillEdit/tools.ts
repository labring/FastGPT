import { getErrText } from '@fastgpt/global/common/error/utils';
import type { ChatCompletionTool } from '@fastgpt/global/core/ai/llm/type';
import { SubAppIds } from '@fastgpt/global/core/workflow/node/agent/constants';
import { getFileContentByUrl } from '../../../chat/fileContext';
import { parseJsonArgs } from '../../utils';
import { z } from 'zod';

const SkillEditReadFilesSchema = z.object({
  ids: z.array(z.string())
});

export const skillEditReadFilesTool: ChatCompletionTool = {
  type: 'function',
  function: {
    name: SubAppIds.readFiles,
    description: '读取指定文件的内容',
    parameters: {
      type: 'object',
      properties: {
        ids: {
          type: 'array',
          items: {
            type: 'string'
          },
          description: '文件 ID'
        }
      },
      required: ['ids']
    }
  }
};

/**
 * 执行 Skill Edit 场景的 read_files，不依赖 workflow 工具调度器。
 */
export const runSkillEditReadFiles = async ({
  args,
  filesMap,
  teamId,
  tmbId,
  customPdfParse,
  usageId
}: {
  args: string;
  filesMap: Record<string, string>;
  teamId: string;
  tmbId: string;
  customPdfParse?: boolean;
  usageId?: string;
}) => {
  const toolParams = SkillEditReadFilesSchema.safeParse(parseJsonArgs(args));
  if (!toolParams.success) {
    return toolParams.error.message;
  }

  const files = toolParams.data.ids.flatMap((id) => {
    const url = filesMap[id];
    return url ? [{ id, url }] : [];
  });
  const result = await Promise.all(
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

  return JSON.stringify(result);
};
