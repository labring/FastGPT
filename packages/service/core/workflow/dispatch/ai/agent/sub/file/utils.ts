import type { ChatCompletionTool } from '@fastgpt/global/core/ai/type';
import { SubAppIds } from '@fastgpt/global/core/workflow/node/agent/constants';
import { parseUrlToFileType } from '../../../../../utils/context';
import { getLogger, LogCategories } from '../../../../../../../common/logger';
import { getHistoryFileLinks } from '../../../../tools/readFiles';
import type { ChatItemType } from '@fastgpt/global/core/chat/type';
import { ChatFileTypeEnum } from '@fastgpt/global/core/chat/constants';
import z from 'zod';

export const ReadFileToolSchema = z.object({
  file_indexes: z.array(z.string())
});
export const readFileTool: ChatCompletionTool = {
  type: 'function',
  function: {
    name: SubAppIds.fileRead,
    description: '读取指定文件的内容',
    parameters: {
      type: 'object',
      properties: {
        file_indexes: {
          type: 'array',
          items: {
            type: 'string'
          },
          description: '文件序号'
        }
      },
      required: ['file_indexes']
    }
  }
};

export const formatFileInput = ({
  fileUrls = [],
  requestOrigin,
  maxFiles,
  histories,
  useSkill
}: {
  fileUrls?: string[];
  requestOrigin?: string;
  maxFiles: number;
  histories: ChatItemType[];
  useSkill: boolean;
}): {
  filesMap: Record<string, string>;
  allFilesMap: Record<string, { url: string; name: string; type: string }>;
  prompt: string;
} => {
  const filesFromHistories = getHistoryFileLinks(histories);

  if (filesFromHistories.length === 0 && fileUrls.length === 0) {
    return {
      filesMap: {},
      allFilesMap: {},
      prompt: ''
    };
  }

  const parseFn = (urls: string[]) => {
    const parseResult = urls
      // Remove invalid urls
      .filter((url) => {
        if (typeof url !== 'string') return false;

        // 检查相对路径
        const validPrefixList = ['/', 'http', 'ws'];
        if (validPrefixList.some((prefix) => url.startsWith(prefix))) {
          return true;
        }

        return false;
      })
      .map((url) => {
        try {
          // Check is system upload file
          if (url.startsWith('/') || (requestOrigin && url.startsWith(requestOrigin))) {
            //  Remove the origin(Make intranet requests directly)
            if (requestOrigin && url.startsWith(requestOrigin)) {
              url = url.replace(requestOrigin, '');
            }
          }

          return url;
        } catch (error) {
          getLogger(LogCategories.MODULE.AI.AGENT).warn(`Parse url error`, { error });
          return '';
        }
      })
      .filter(Boolean)
      .slice(0, maxFiles)
      .map(parseUrlToFileType) as {
      type: `${ChatFileTypeEnum}`;
      name: string;
      url: string;
    }[];

    return parseResult;
  };

  const historyParseResult = parseFn(filesFromHistories);
  const queryParseResult = parseFn(fileUrls);

  // 去重：基于文件名去重，避免历史记录和当前请求中的文件重复（避免 plan agent ask 之后的文件二次传入）
  // 优先使用新的 URL（queryParseResult），因为预签名 URL 有过期时间，新的更不容易过期
  const allFiles = [...queryParseResult, ...historyParseResult];
  const uniqueFilesMap = new Map<string, { type: string; name: string; url: string }>();

  allFiles.forEach((file) => {
    // 使用文件名作为 key 进行去重
    if (!uniqueFilesMap.has(file.name)) {
      uniqueFilesMap.set(file.name, file);
    }
  });

  const uniqueFiles = Array.from(uniqueFilesMap.values());

  // Build allFilesMap: all files (documents + images) with unified sequential index
  const allFilesMap = uniqueFiles.reduce(
    (acc, item, index) => {
      acc[`${index + 1}`] = { url: item.url, name: item.name, type: item.type };
      return acc;
    },
    {} as Record<string, { url: string; name: string; type: string }>
  );

  // filesMap: derived from allFilesMap, only document type files (preserving index)
  const filesMap = Object.entries(allFilesMap)
    .filter(([, v]) => v.type === ChatFileTypeEnum.file)
    .reduce(
      (acc, [k, v]) => {
        acc[k] = v.url;
        return acc;
      },
      {} as Record<string, string>
    );

  /* ===== 构建新文件的提示词 ===== */
  // 只为新上传的文件（在 queryParseResult 中但不在历史中的）生成 prompt. skill 模式，都注入提示词
  const newFiles = queryParseResult.filter(
    (queryFile) =>
      (queryFile.type === ChatFileTypeEnum.file || useSkill) &&
      !historyParseResult.some((histFile) => histFile.name === queryFile.name)
  );
  const promptList = newFiles.map((item) => {
    const index = uniqueFiles.findIndex((f) => f.name === item.name);
    return {
      index: `${index + 1}`,
      name: item.name,
      type: item.type === ChatFileTypeEnum.file ? 'document' : 'image'
    };
  });

  const prompt =
    newFiles.length > 0
      ? `<available_files>
当前对话中用户已上传以下文件：

${promptList.map((item) => `- 文件${item.index}: ${item.name}(${item.type})`).join('\n')}
**重要提示**：
- 如果用户的任务涉及文件分析、解析或处理，请在规划步骤时优先考虑使用文件解析工具
- 在步骤的 description 中可以使用 @文件解析工具 来处理这些文件

${
  useSkill
    ? `**文件访问说明**：
- 读取文本内容 → 使用 file_read 工具（仅支持 document 类型）
- 将文件写入沙箱供技能处理 → 使用 sandbox_fetch_user_file 工具（支持所有类型）`
    : ''
}
</available_files>`
      : '';

  return {
    filesMap,
    allFilesMap,
    prompt
  };
};

export const addFilePrompt2Input = ({
  query,
  filePrompt
}: {
  query: string;
  filePrompt?: string;
}) => {
  if (!filePrompt) return query;

  return `## File input
${filePrompt}

## Query
${query}`;
};
