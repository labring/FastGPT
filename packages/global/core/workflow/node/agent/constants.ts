import type { I18nStringType, localeType } from '../../../../common/i18n/type';
import {
  AGENT_SANDBOX_TOOLSET_ID,
  SANDBOX_ICON,
  SANDBOX_NAME,
  sandboxToolMap
} from '../../../ai/sandbox/tools';
import { parseI18nString } from '../../../../common/i18n/utils';

export enum SubAppIds {
  ask = 'ask_agent',
  model = 'model_agent',
  readFiles = 'read_files',
  datasetSearch = 'dataset_search'
}

export const systemSubInfo: Record<
  string,
  { name: I18nStringType; avatar: string; toolDescription: string }
> = {
  [SubAppIds.readFiles]: {
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
  [AGENT_SANDBOX_TOOLSET_ID]: {
    name: SANDBOX_NAME,
    avatar: SANDBOX_ICON,
    toolDescription:
      '提供完整虚拟机能力，包括命令执行、文件读写、文件编辑、文件搜索和文件链接生成。'
  },
  ...sandboxToolMap
};
export const getSystemToolInfo = (id: string, lang: localeType = 'en') => {
  if (id in systemSubInfo) {
    const info = systemSubInfo[id];
    return {
      name: parseI18nString(info.name, lang),
      avatar: info.avatar,
      toolDescription: info.toolDescription
    };
  }
};
