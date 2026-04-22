import z from 'zod';
import type { ChatCompletionTool } from '../../../ai/llm/type';
import type { I18nStringType, localeType } from '../../../../common/i18n/type';
import { parseI18nString } from '../../../../common/i18n/utils';

export enum SandboxToolIds {
  readFile = 'sandbox_read_file',
  writeFile = 'sandbox_write_file',
  editFile = 'sandbox_edit_file',
  execute = 'sandbox_execute',
  search = 'sandbox_search',
  fetchUserFile = 'sandbox_fetch_user_file'
}

export const skillToolsMap: Record<
  string,
  { name: I18nStringType; avatar: string; toolDescription: string }
> = {
  // Sandbox tools
  [SandboxToolIds.readFile]: {
    name: {
      'zh-CN': '读取文件',
      'zh-Hant': '讀取文件',
      en: 'ReadFile'
    },
    avatar: 'core/workflow/template/readFiles',
    toolDescription:
      'Read file contents in the sandbox, supports batch reading. Used to view SKILL.md documents, config files, execution results, etc.'
  },
  [SandboxToolIds.writeFile]: {
    name: {
      'zh-CN': '写入文件',
      'zh-Hant': '寫入文件',
      en: 'WriteFile'
    },
    avatar: 'core/workflow/template/readFiles',
    toolDescription:
      'Create or overwrite a file in the sandbox. Used to write input data, create config files, etc.'
  },
  [SandboxToolIds.editFile]: {
    name: {
      'zh-CN': '编辑文件',
      'zh-Hant': '編輯文件',
      en: 'EditFile'
    },
    avatar: 'core/workflow/template/readFiles',
    toolDescription:
      'Edit files in the sandbox precisely by finding and replacing specified content. Supports batch editing across multiple files.'
  },
  [SandboxToolIds.execute]: {
    name: {
      'zh-CN': '执行命令',
      'zh-Hant': '執行命令',
      en: 'Execute'
    },
    avatar: 'core/workflow/template/codeRun',
    toolDescription:
      'Execute a shell command in the sandbox. Used to run scripts, install dependencies, execute skills, etc.'
  },
  [SandboxToolIds.search]: {
    name: {
      'zh-CN': '搜索文件',
      'zh-Hant': '搜索文件',
      en: 'SearchFile'
    },
    avatar: 'core/workflow/template/datasetSearch',
    toolDescription:
      'Search for files in the sandbox. Find matching file paths by filename pattern (glob).'
  },
  [SandboxToolIds.fetchUserFile]: {
    name: {
      'zh-CN': '获取用户文件',
      'zh-Hant': '獲取用戶文件',
      en: 'FetchUserFile'
    },
    avatar: 'core/workflow/template/readFiles',
    toolDescription:
      'Download a user-uploaded file (document or image) from the conversation and write it as a binary file into the sandbox filesystem. Use this when a skill script needs to process a raw file. Workflow: call this tool first to place the file at target_path (relative to workspace), then run skill scripts that read from that path.'
  }
};
export const getSkillToolInfo = (
  id: string,
  lang: localeType = 'en'
): { name: string; avatar: string; toolDescription: string } | undefined => {
  const toolInfo = skillToolsMap[id];
  if (toolInfo) {
    return {
      name: parseI18nString(toolInfo.name, lang),
      avatar: toolInfo.avatar,
      toolDescription: toolInfo.toolDescription
    };
  }
};

// Zod parameter schemas (runtime validation)
export const SandboxReadFileSchema = z.object({
  paths: z.array(z.string()).describe('Array of absolute file paths')
});
export const SandboxWriteFileSchema = z.object({
  path: z.string().describe('Absolute file path'),
  content: z.string().describe('File content')
});
export const SandboxEditFileSchema = z.object({
  entries: z.array(
    z.object({
      path: z.string().describe('Absolute file path'),
      oldContent: z.string().describe('Original content to replace'),
      newContent: z.string().describe('New content after replacement')
    })
  )
});
export const SandboxExecuteSchema = z.object({
  command: z.string().describe('Shell command to execute'),
  workingDirectory: z.string().optional().describe('Working directory (optional)'),
  timeoutMs: z.number().optional().default(30000).describe('Timeout in milliseconds')
});
export const SandboxSearchSchema = z.object({
  pattern: z.string().describe('Search pattern (filename or glob)'),
  path: z.string().optional().describe('Starting path for search (optional)')
});
export const SandboxFetchUserFileSchema = z.object({
  file_index: z.string().describe('File index from available_files (e.g. "1")'),
  target_path: z
    .string()
    .describe(
      'Relative path from workspace root to write the file (e.g. "uploads/document.pdf"). Do NOT use absolute paths or "..".'
    )
});

// ChatCompletionTool definitions (exposed to LLM)
export const sandboxReadFileTool: ChatCompletionTool = {
  type: 'function',
  function: {
    name: SandboxToolIds.readFile,
    description: skillToolsMap[SandboxToolIds.readFile].toolDescription,
    parameters: {
      type: 'object',
      properties: {
        paths: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of absolute file paths'
        }
      },
      required: ['paths']
    }
  }
};

export const sandboxWriteFileTool: ChatCompletionTool = {
  type: 'function',
  function: {
    name: SandboxToolIds.writeFile,
    description: skillToolsMap[SandboxToolIds.writeFile].toolDescription,
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute file path' },
        content: { type: 'string', description: 'File content' }
      },
      required: ['path', 'content']
    }
  }
};

export const sandboxEditFileTool: ChatCompletionTool = {
  type: 'function',
  function: {
    name: SandboxToolIds.editFile,
    description: skillToolsMap[SandboxToolIds.editFile].toolDescription,
    parameters: {
      type: 'object',
      properties: {
        entries: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'Absolute file path' },
              oldContent: { type: 'string', description: 'Original content to replace' },
              newContent: { type: 'string', description: 'New content after replacement' }
            },
            required: ['path', 'oldContent', 'newContent']
          },
          description: 'Array of edit operations'
        }
      },
      required: ['entries']
    }
  }
};

export const sandboxExecuteTool: ChatCompletionTool = {
  type: 'function',
  function: {
    name: SandboxToolIds.execute,
    description: skillToolsMap[SandboxToolIds.execute].toolDescription,
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Shell command to execute' },
        workingDirectory: { type: 'string', description: 'Working directory (optional)' },
        timeoutMs: { type: 'number', description: 'Timeout in milliseconds (default 30000)' }
      },
      required: ['command']
    }
  }
};

export const sandboxSearchTool: ChatCompletionTool = {
  type: 'function',
  function: {
    name: SandboxToolIds.search,
    description: skillToolsMap[SandboxToolIds.search].toolDescription,
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Search pattern (filename or glob)' },
        path: { type: 'string', description: 'Starting path for search (optional)' }
      },
      required: ['pattern']
    }
  }
};

export const sandboxFetchUserFileTool: ChatCompletionTool = {
  type: 'function',
  function: {
    name: SandboxToolIds.fetchUserFile,
    description: skillToolsMap[SandboxToolIds.fetchUserFile].toolDescription,
    parameters: {
      type: 'object',
      properties: {
        file_index: {
          type: 'string',
          description: 'File index from available_files (e.g. "1")'
        },
        target_path: {
          type: 'string',
          description:
            'Relative path from workspace root (e.g. "uploads/document.pdf"). Must not start with "/" or contain "..".'
        }
      },
      required: ['file_index', 'target_path']
    }
  }
};

export const allSandboxTools: ChatCompletionTool[] = [
  sandboxReadFileTool,
  sandboxWriteFileTool,
  sandboxEditFileTool,
  sandboxExecuteTool,
  sandboxSearchTool,
  sandboxFetchUserFileTool
];
