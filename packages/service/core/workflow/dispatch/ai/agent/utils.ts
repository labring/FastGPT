import type { localeType } from '@fastgpt/global/common/i18n/type';
import type { AgentLoopProviderName } from '../../../../ai/llm/agentLoop/interface';
import { serviceEnv } from '../../../../../env';
import type { SubAppRuntimeType } from './type';
import { getAgentLoopCoreSystemToolInfo } from '../agentLoopCore/interface';

/**
 * 解析本次 workflow agent 应使用的 agentLoop provider。
 * 业务层只关心 provider 名称，不直接判断具体实现入口。
 */
export const getWorkflowAgentLoopProvider = (): AgentLoopProviderName =>
  serviceEnv.AGENT_ENGINE === 'piAgent' ? 'piAgent' : 'fastAgent';

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
          avatar: userToolNode.avatar || '',
          toolDescription: userToolNode.toolDescription || userToolNode.name || ''
        };
      }

      const systemToolNode =
        getAgentLoopCoreSystemToolInfo({ name: id, lang }) ||
        getAgentLoopCoreSystemToolInfo({ name: formatId, lang });
      return {
        name: systemToolNode?.name || '',
        avatar: systemToolNode?.avatar || '',
        toolDescription: systemToolNode?.toolDescription || systemToolNode?.name || ''
      };
    },
    getSubApp: (id: string) => {
      const formatId = normalizeToolId(id);
      return subAppsMap.get(id) || subAppsMap.get(formatId);
    }
  };
};
