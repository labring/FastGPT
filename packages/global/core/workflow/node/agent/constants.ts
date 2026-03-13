import type { I18nStringType } from '../../../../common/i18n/type';
import { SandboxToolIds } from './sandboxTools';

export enum SubAppIds {
  plan = 'plan_agent',
  ask = 'ask_agent',
  model = 'model_agent',
  fileRead = 'file_read',
  datasetSearch = 'dataset_search'
}

export const systemSubInfo: Record<
  string,
  { name: I18nStringType; avatar: string; toolDescription: string }
> = {
  [SubAppIds.plan]: {
    name: {
      'zh-CN': '规划Agent',
      'zh-Hant': '規劃Agent',
      en: 'PlanAgent'
    },
    avatar: 'common/detail',
    toolDescription: '将任务拆解成多个步骤执行，适合处理复杂任务。'
  },
  [SubAppIds.fileRead]: {
    name: {
      'zh-CN': '文件解析',
      'zh-Hant': '文件解析',
      en: 'FileParsing'
    },
    avatar: 'core/workflow/template/readFiles',
    toolDescription: '读取文件内容，并返回文件内容。'
  },
  [SubAppIds.datasetSearch]: {
    name: {
      'zh-CN': '知识库检索',
      'zh-Hant': '知識庫檢索',
      en: 'DatasetSearch'
    },
    avatar: 'core/workflow/template/datasetSearch',
    toolDescription:
      '搜索知识库获取相关信息，当有相关知识库信息的时候可以使用此工具来对知识库进行检索'
  },
  [SubAppIds.ask]: {
    name: {
      'zh-CN': '询问Agent',
      'zh-Hant': '詢問Agent',
      en: 'AskAgent'
    },
    avatar: 'core/workflow/template/agent',
    toolDescription: '询问用户问题，并返回用户回答。'
  },
  [SubAppIds.model]: {
    name: {
      'zh-CN': '模型Agent',
      'zh-Hant': '模型Agent',
      en: 'ModelAgent'
    },
    avatar: 'core/workflow/template/agent',
    toolDescription: '调用 LLM 模型完成一些通用任务。'
  },
  // Sandbox tools
  [SandboxToolIds.readFile]: {
    name: {
      'zh-CN': '读取文件',
      'zh-Hant': '讀取文件',
      en: 'ReadFile'
    },
    avatar: 'core/workflow/template/readFiles',
    toolDescription: 'Read file contents in the sandbox'
  },
  [SandboxToolIds.writeFile]: {
    name: {
      'zh-CN': '写入文件',
      'zh-Hant': '寫入文件',
      en: 'WriteFile'
    },
    avatar: 'core/workflow/template/readFiles',
    toolDescription: 'Create or overwrite a file in the sandbox'
  },
  [SandboxToolIds.editFile]: {
    name: {
      'zh-CN': '编辑文件',
      'zh-Hant': '編輯文件',
      en: 'EditFile'
    },
    avatar: 'core/workflow/template/readFiles',
    toolDescription: 'Edit files in the sandbox precisely'
  },
  [SandboxToolIds.execute]: {
    name: {
      'zh-CN': '执行命令',
      'zh-Hant': '執行命令',
      en: 'Execute'
    },
    avatar: 'core/workflow/template/codeRun',
    toolDescription: 'Execute a shell command in the sandbox'
  },
  [SandboxToolIds.search]: {
    name: {
      'zh-CN': '搜索文件',
      'zh-Hant': '搜索文件',
      en: 'SearchFile'
    },
    avatar: 'core/workflow/template/datasetSearch',
    toolDescription: 'Search for files in the sandbox'
  },
  [SandboxToolIds.fetchUserFile]: {
    name: {
      'zh-CN': '获取用户文件',
      'zh-Hant': '獲取用戶文件',
      en: 'FetchUserFile'
    },
    avatar: 'core/workflow/template/readFiles',
    toolDescription: 'Download a user-uploaded file into the sandbox filesystem'
  }
};
