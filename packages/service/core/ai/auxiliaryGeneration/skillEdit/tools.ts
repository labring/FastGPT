import { readAgentFiles } from '../../agent/service';
import { parseJsonArgs } from '../../utils';
import { z } from 'zod';

const SkillEditReadFilesSchema = z.object({
  ids: z.array(z.string())
});

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
