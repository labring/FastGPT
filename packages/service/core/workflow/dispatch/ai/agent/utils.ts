import type {
  ChatCompletionAssistantMessageParam,
  ChatCompletionMessageParam
} from '@fastgpt/global/core/ai/type';
import type { ToolNodeItemType } from './type';

const namespaceMap = new Map<string, string>([
  ['a', '子应用'],
  ['t', '工具'],
  ['d', '知识库'],
  ['m', '模型']
]);

// e.g: {{@a.appId@}} -> a.appId
const buildPattern = (options?: { prefix?: string }): RegExp => {
  const config = {
    prefix: '@',
    ...options
  };

  const escapedPrefix = config.prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\{\\{${escapedPrefix}([^${escapedPrefix}]+)${escapedPrefix}\\}\\}`, 'g');
};

export const getSubIdsByAgentSystem = (
  systemPrompt: string,
  options?: { prefix?: string }
): string[] => {
  const pattern = buildPattern(options);
  const ids: string[] = [];
  let match;

  while ((match = pattern.exec(systemPrompt)) !== null) {
    const fullName = match[1];
    const [, id] = fullName.split('.');
    if (id) {
      ids.push(id);
    }
  }

  return ids;
};

export const parseAgentSystem = ({
  systemPrompt,
  toolNodesMap,
  options
}: {
  systemPrompt: string;
  toolNodesMap: Map<string, ToolNodeItemType>;
  options?: { prefix?: string };
}): string => {
  const pattern = buildPattern(options);

  const processedPrompt = systemPrompt.replace(pattern, (_, toolName) => {
    const [namespace, id] = toolName.split('.');
    const toolNode = toolNodesMap.get(id);
    const name = toolNode?.name || toolNode?.toolDescription || toolNode?.intro || 'unknown';

    const prefix = namespaceMap.get(namespace) ?? 'unknown';
    return `${prefix}:${name}`;
  });

  return processedPrompt;
};
