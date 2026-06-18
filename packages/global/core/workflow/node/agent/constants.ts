import type { I18nStringType, localeType } from '../../../../common/i18n/type';
import {
  AGENT_SANDBOX_TOOLSET_ID,
  SANDBOX_ICON,
  SANDBOX_NAME,
  sandboxToolMap
} from '../../../ai/sandbox/tools';
import { parseI18nString } from '../../../../common/i18n/utils';
import { documentFileType } from '../../../../common/file/constants';

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
    toolDescription: `读取文档并返回文档内容，支持: ${documentFileType}`
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
  [AGENT_SANDBOX_TOOLSET_ID]: {
    name: SANDBOX_NAME,
    avatar: SANDBOX_ICON,
    toolDescription:
      '提供完整虚拟机能力，包括命令执行、文件读写、文件编辑、文件搜索和文件链接生成。'
  }
};
export const getSystemToolInfo = (id: string, lang: localeType = 'en') => {
  if (id in sandboxToolMap) {
    const info = sandboxToolMap[id];
    return {
      name: parseI18nString(info.name, lang),
      avatar: info.avatar,
      toolDescription: info.toolDescription
    };
  }

  if (id in systemSubInfo) {
    const info = systemSubInfo[id];
    return {
      name: parseI18nString(info.name, lang),
      avatar: info.avatar,
      toolDescription: info.toolDescription
    };
  }
};
