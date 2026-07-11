import type { ChatCompletionTool } from '@fastgpt/global/core/ai/llm/type';
import { SubAppIds } from '@fastgpt/global/core/workflow/node/agent/constants';
import { readAgentFiles } from '../../agent/service';
import { parseJsonArgs } from '../../utils';
import { z } from 'zod';

const SkillEditReadFilesSchema = z.object({
  ids: z.array(z.string())
});

export const skillEditReadFilesTool: ChatCompletionTool = {
  type: 'function',
  function: {
    name: SubAppIds.readFiles,
    description:
      '读取 Skill Detail 对话上传的文档内容；文件不在虚拟机中，必须传入对话文件列表里的 id',
    parameters: {
      type: 'object',
      properties: {
        ids: {
          type: 'array',
          items: {
            type: 'string'
          },
          description: 'Skill Detail 对话文件列表中的文档 ID'
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
  const result = await readAgentFiles({
    files,
    teamId,
    tmbId,
    customPdfParse,
    usageId
  });

  return JSON.stringify(result);
};
