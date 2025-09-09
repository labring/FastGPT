import type { ChatCompletionTool } from '@fastgpt/global/core/ai/type';
import { SubAppIds } from '../constants';
import { parseUrlToFileType } from '@fastgpt/global/common/file/tools';
import { addLog } from '../../../../../../../common/system/log';
import { getHistoryFileLinks } from '../../../../tools/readFiles';
import type { ChatItemType } from '@fastgpt/global/core/chat/type';
import { ChatFileTypeEnum } from '@fastgpt/global/core/chat/constants';

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

export const getFileInputPrompt = ({
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

  const promptList: { index: string; name: string }[] = [];
  queryParseResult.forEach((item, index) => {
    promptList.push({ index: `${historyParseResult.length + index + 1}`, name: item.name });
  });

  return {
    filesMap: [...historyParseResult, ...queryParseResult].reduce(
      (acc, item, index) => {
        acc[index + 1] = item.url;
        return acc;
      },
      {} as Record<string, string>
    ),
    prompt: promptList.length > 0 ? JSON.stringify(promptList) : ''
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
