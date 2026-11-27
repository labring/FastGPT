import type { localeType } from '@fastgpt/global/common/i18n/type';
import type { SubAppRuntimeType } from './type';
import { getAgentLoopCoreSystemToolInfo } from '../agentLoopCore/interface';

/**
 * 创建 Agent 工具展示信息查询器。
 * 用户选择的子应用和 provider 注入的内置工具来源不同，workflow 运行详情只消费统一后的 name/avatar/description。
 */
export const createAgentSubAppLookup = ({
  subAppsMap,
  lang
}: {
  subAppsMap: Map<string, SubAppRuntimeType>;
  lang?: localeType;
}) => {
  const normalizeToolId = (id: string) => (id.startsWith('t') ? id.slice(1) : id);

  return {
    getSubAppInfo: (id: string) => {
      const formatId = normalizeToolId(id);
      const userToolNode = subAppsMap.get(id) || subAppsMap.get(formatId);
      if (userToolNode) {
        return {
          name: userToolNode.name || '',
          avatar: userToolNode.avatar || ''
        };
      }

      const systemToolNode =
        getAgentLoopCoreSystemToolInfo({ name: id, lang }) ||
        getAgentLoopCoreSystemToolInfo({ name: formatId, lang });
      return {
        name: systemToolNode?.name || '',
        avatar: systemToolNode?.avatar || ''
      };
    },
    getSubApp: (id: string) => {
      const formatId = normalizeToolId(id);
      return subAppsMap.get(id) || subAppsMap.get(formatId);
    }
  };
};
