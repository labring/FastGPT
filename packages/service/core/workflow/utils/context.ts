import { imageFileType } from '@fastgpt/global/common/file/constants';
import { ChatFileTypeEnum } from '@fastgpt/global/core/chat/constants';
import type {
  UserChatItemFileItemType,
  UserChatItemValueItemType
} from '@fastgpt/global/core/chat/type';
import { replaceVariable } from '@fastgpt/global/common/string/tools';
import { getDocumentQuotePrompt } from '@fastgpt/global/core/ai/prompt/AIChat';
import { AsyncLocalStorage } from 'async_hooks';
import path from 'path';
import type { MCPClient } from '../../app/mcp';

type ContextType = {
  queryUrlTypeMap: Record<string, ChatFileTypeEnum>;
  mcpClientMemory: Record<string, MCPClient>;
};

type GetFileContentFromLinks = (props: {
  urls: string[];
  requestOrigin?: string;
  maxFiles: number;
  teamId: string;
  tmbId: string;
  customPdfParse?: boolean;
  usageId?: string;
}) => Promise<{
  readFilesResult: {
    url: string;
    text?: string;
  }[];
}>;

export const WorkflowContext = new AsyncLocalStorage<ContextType>();

export const runWithContext = (value: ContextType, fn: (ctx: ContextType) => void) => {
  WorkflowContext.run(value, () => {
    const store = WorkflowContext.getStore()!;
    fn(store);
  });
};

export const getWorkflowContext = (): ContextType => {
  return WorkflowContext.getStore()!;
};

export const updateWorkflowContextVal = (val: Partial<ContextType>) => {
  const context = getWorkflowContext();
  if (context) {
    for (const key in val) {
      // @ts-ignore
      context[key] = val[key];
    }
  }
};

// Url => user upload file type
export const parseUrlToFileType = (url: string): UserChatItemFileItemType | undefined => {
  if (typeof url !== 'string') return;

  // Handle base64 image
  if (url.startsWith('data:')) {
    const matches = url.match(/^data:([^;]+);base64,/);
    if (!matches) return;

    const mimeType = matches[1].toLowerCase();
    if (!mimeType.startsWith('image/')) return;

    const extension = mimeType.split('/')[1];
    return {
      type: ChatFileTypeEnum.image,
      name: `image.${extension}`,
      url
    };
  }

  try {
    const parseUrl = new URL(url, 'http://localhost:3000');

    // Get filename from URL
    const filename = (() => {
      // Here is a S3 Object Key
      if (url.startsWith('chat/')) {
        const basename = path.basename(url);
        // Return empty if no extension
        return basename.includes('.') ? basename : '';
      }

      const fromParam = parseUrl.searchParams.get('filename');
      if (fromParam) {
        return fromParam;
      }

      const basename = path.basename(parseUrl.pathname);
      // Return empty if no extension
      return basename.includes('.') ? basename : '';
    })();

    const context = getWorkflowContext();
    const type = context?.queryUrlTypeMap[url];
    if (type) {
      return {
        type,
        name: filename ? decodeURIComponent(filename) : url,
        url
      };
    }

    const extension = filename?.split('.').pop()?.toLowerCase() || '';

    if (extension && imageFileType.includes(extension)) {
      // Default to file type for non-extension files
      return {
        type: ChatFileTypeEnum.image,
        name: filename ? decodeURIComponent(filename) : url,
        url
      };
    }
    // If it's a document type, return as file, otherwise treat as image
    return {
      type: ChatFileTypeEnum.file,
      name: filename ? decodeURIComponent(filename) : url,
      url
    };
  } catch (error) {
    return {
      type: ChatFileTypeEnum.file,
      name: url,
      url
    };
  }
};

export const rewriteUserQueryWithFileContent = async ({
  userQuery,
  requestOrigin,
  maxFiles,
  customPdfParse,
  teamId,
  tmbId,
  usageId,
  version,
  getFileContentFromLinks
}: {
  userQuery: UserChatItemValueItemType[];
  requestOrigin?: string;
  maxFiles: number;
  customPdfParse?: boolean;
  teamId: string;
  tmbId: string;
  usageId?: string;
  version?: string;
  getFileContentFromLinks: GetFileContentFromLinks;
}) => {
  const urls = userQuery
    .map((item) => (item.file?.type === ChatFileTypeEnum.file ? item.file.url : ''))
    .filter(Boolean);

  if (urls.length === 0) {
    return userQuery;
  }

  const { readFilesResult } = await getFileContentFromLinks({
    urls,
    requestOrigin,
    maxFiles,
    teamId,
    tmbId,
    customPdfParse,
    usageId
  });

  const fileTexts = readFilesResult.map((item) => item?.text).filter(Boolean) as string[];

  if (fileTexts.length === 0) {
    return userQuery;
  }

  const filePrompt = replaceVariable(getDocumentQuotePrompt(version), {
    quote: fileTexts.join('\n******\n')
  });
  if (!filePrompt) return userQuery;

  const value = userQuery.map((item) => {
    if (item.text) {
      return {
        ...item,
        text: {
          ...item.text
        }
      };
    }
    if (item.file) {
      return {
        ...item,
        file: {
          ...item.file
        }
      };
    }
    return { ...item };
  });

  const firstTextItem = value.find((item) => item.text);
  if (firstTextItem?.text) {
    firstTextItem.text.content = [firstTextItem.text.content, filePrompt]
      .filter(Boolean)
      .join('\n\n===---===---===\n\n');
  } else {
    value.push({
      text: {
        content: filePrompt
      }
    });
  }

  return value;
};
