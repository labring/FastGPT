import { useState, useEffect, useMemo } from 'react';
import type {
  ToolDetailFetchResponse,
  ToolDetailResponseType,
  ToolDetailExtendedType
} from './types';
import { useRequest } from '../../../../../hooks/useRequest';
import {
  jsonSchema2NodeInput,
  jsonSchema2NodeOutput,
  jsonSchema2SecretInput
} from '@fastgpt/global/core/app/jsonschema';

export type UseToolDetailProps = {
  toolId?: string;
  version?: string;
  tags?: string[];
  onFetchDetail?: (toolId: string, version?: string) => Promise<ToolDetailFetchResponse>;
  autoFetch?: boolean;
};

const getVersionList = (tool: Record<string, any>) => {
  if (tool.versionList) return tool.versionList;

  return [
    {
      inputs:
        tool.inputs ||
        jsonSchema2NodeInput({
          jsonSchema: tool.inputSchema,
          schemaType: 'systemTool'
        }),
      outputs: tool.outputs || jsonSchema2NodeOutput({ jsonSchema: tool.outputSchema })
    }
  ];
};

const normalizeTool = (tool: Record<string, any>): ToolDetailExtendedType => ({
  ...tool,
  pluginId: tool.pluginId || tool.toolId || tool.id,
  id: tool.id || tool.toolId || tool.pluginId,
  name: tool.name || '',
  intro: tool.intro || tool.description || '',
  description: tool.description || tool.intro || '',
  icon: tool.icon || tool.avatar,
  courseUrl: tool.courseUrl || tool.tutorialUrl,
  hasSystemSecret: tool.hasSystemSecret ?? Boolean(tool.secretSchema),
  secrets: tool.secrets || jsonSchema2SecretInput({ jsonSchema: tool.secretSchema }),
  readme: tool.readme || tool.readmeUrl,
  versionList: getVersionList(tool)
});

const normalizeToolDetail = (
  detail?: ToolDetailFetchResponse
): ToolDetailResponseType | undefined => {
  if (!detail) return undefined;

  if (Array.isArray(detail.tools)) {
    return {
      ...detail,
      tools: detail.tools.map((tool: Record<string, any>) => normalizeTool(tool))
    };
  }

  const tool = detail as Record<string, any>;
  const parentTool = normalizeTool(tool);

  const childTools: ToolDetailExtendedType[] = (tool.children || []).map(
    (child: Record<string, any>) => ({
      ...normalizeTool({
        ...child,
        pluginId: child.pluginId || `${parentTool.pluginId}/${child.id}`,
        id: child.id,
        version: tool.version
      }),
      parentId: parentTool.id || parentTool.pluginId,
      author: child.author || tool.author
    })
  );

  return {
    tools: [parentTool, ...childTools]
  };
};

export const useToolDetail = ({
  toolId,
  version,
  tags,
  onFetchDetail,
  autoFetch = true
}: UseToolDetailProps) => {
  const [readmeContent, setReadmeContent] = useState<string>('');

  // 使用 useRequest2 替代手动的 useEffect，避免无限请求问题
  const {
    data: toolDetail,
    loading: loadingDetail,
    run: fetchToolDetail
  } = useRequest(
    async (id: string, version?: string) => {
      if (!onFetchDetail) return undefined;
      const detail = await onFetchDetail(id, version);
      return normalizeToolDetail(detail);
    },
    {
      manual: true,
      errorToast: ''
    }
  );

  // 自动获取工具详情
  useEffect(() => {
    if (toolId && autoFetch && onFetchDetail) {
      fetchToolDetail(toolId, version);
    }
  }, [toolId, version, autoFetch]);

  // Calculate tool structure
  const isToolSet = useMemo(() => {
    if (!toolDetail?.tools || !Array.isArray(toolDetail?.tools) || toolDetail?.tools.length === 0) {
      return false;
    }
    const subTools = toolDetail?.tools.filter((subTool: any) => subTool.parentId);
    return subTools.length > 0;
  }, [toolDetail?.tools]);

  const parentTool = useMemo(() => {
    const parentTool = toolDetail?.tools.find((tool: ToolDetailExtendedType) => !tool.parentId);
    return {
      ...parentTool,
      tags
    };
  }, [tags, toolDetail?.tools]);

  const subTools = useMemo(() => {
    if (!isToolSet || !toolDetail?.tools) return [];
    return toolDetail?.tools.filter((subTool: ToolDetailExtendedType) => !!subTool.parentId);
  }, [isToolSet, toolDetail?.tools]);

  // Fetch README
  useEffect(() => {
    const fetchReadme = async () => {
      if (!toolDetail) return;
      const readmeUrl = parentTool?.readme;
      if (!readmeUrl) {
        setReadmeContent('');
        return;
      }

      try {
        const response = await fetch(readmeUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch README: ${response.status}`);
        }
        let content = await response.text();

        const baseUrl = readmeUrl.substring(0, readmeUrl.lastIndexOf('/') + 1);

        content = content.replace(
          /!\[([^\]]*)\]\(\.\/([^)]+)\)/g,
          (match, alt, path) => `![${alt}](${baseUrl}${path})`
        );
        content = content.replace(
          /!\[([^\]]*)\]\((?!http|https|\/\/)([^)]+)\)/g,
          (match, alt, path) => `![${alt}](${baseUrl}${path})`
        );
        setReadmeContent(content);
      } catch (error) {
        console.error('Failed to fetch README:', error);
        setReadmeContent('');
      }
    };

    fetchReadme();
  }, [toolDetail, parentTool?.readme]);

  return {
    toolDetail,
    loadingDetail,
    readmeContent,
    isToolSet,
    parentTool,
    subTools
  };
};
