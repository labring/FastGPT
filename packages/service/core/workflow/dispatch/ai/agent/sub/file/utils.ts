import type { ChatCompletionTool } from '@fastgpt/global/core/ai/type';
import { SubAppIds } from '../constants';
import { parseUrlToFileType } from '@fastgpt/global/common/file/tools';
import { addLog } from '../../../../../../../common/system/log';
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
  histories
}: {
  fileUrls?: string[];
  requestOrigin?: string;
  maxFiles: number;
  histories: ChatItemType[];
}): {
  filesMap: Record<string, string>;
  prompt: string;
} => {
  const filesFromHistories = getHistoryFileLinks(histories);

  if (filesFromHistories.length === 0 && fileUrls.length === 0) {
    return {
      filesMap: {},
      prompt: ''
    };
  }

  const parseFn = (urls: string[]) => {
    const parseUrlList = urls
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
      // Just get the document type file
      .filter((url) => parseUrlToFileType(url)?.type === 'file')
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
          addLog.warn(`Parse url error`, { error });
          return '';
        }
      })
      .filter(Boolean)
      .slice(0, maxFiles);

    const parseResult = parseUrlList
      .map((url) => parseUrlToFileType(url))
      .filter((item) => item?.name && item?.type === ChatFileTypeEnum.file) as {
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

  // 只为新上传的文件（在 queryParseResult 中但不在历史中的）生成 prompt
  const newFiles = queryParseResult.filter(
    (queryFile) => !historyParseResult.some((histFile) => histFile.name === queryFile.name)
  );

  const promptList: { index: string; name: string }[] = [];
  newFiles.forEach((item) => {
    const index = uniqueFiles.findIndex((f) => f.name === item.name);
    promptList.push({ index: `${index + 1}`, name: item.name });
  });
  const prompt =
    promptList.length > 0
      ? `<available_files>
当前对话中用户已上传以下文件：

${promptList.map((item) => `- 文件${item.index}: ${item.name}`).join('\n')}

**重要提示**：
- 如果用户的任务涉及文件分析、解析或处理，请在规划步骤时优先考虑使用文件解析工具
- 在步骤的 description 中可以使用 @文件解析工具 来处理这些文件
</available_files>`
      : '';

  return {
    filesMap: uniqueFiles.reduce(
      (acc, item, index) => {
        acc[index + 1] = item.url;
        return acc;
      },
      {} as Record<string, string>
    ),
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
