import type { SystemModelDocumentDataType } from '@fastgpt/global/core/ai/model/schema';
import { pluginClient } from '../../../thirdProvider/fastgptPlugin';
import { flatModelToDocumentData } from './transform';

/** 获取插件模型的 canonical 初始文档。 */
export const getPluginSystemModelDocuments = async (): Promise<SystemModelDocumentDataType[]> =>
  pluginClient.listModels().then((models) => models.map((model) => flatModelToDocumentData(model)));

/** 实时拉取并校验模型模板；模板不进入运行时模型缓存。 */
export const refreshModelTemplates = async (): Promise<SystemModelDocumentDataType[]> =>
  getPluginSystemModelDocuments();
