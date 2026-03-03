import { useState, useEffect, useMemo } from 'react';
import type { ToolDetailResponseType, ToolDetailExtendedType } from './types';
import type { GetTeamToolDetailResponseType } from '@fastgpt/global/openapi/core/plugin/team/toolApi';
import { useRequest } from '../../../../../hooks/useRequest';

export type UseToolDetailProps = {
  toolId?: string;
  tags?: string[];
  onFetchDetail?: (toolId: string) => Promise<GetTeamToolDetailResponseType>;
  autoFetch?: boolean;
};

export const useToolDetail = ({
  toolId,
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
    async (id: string) => {
      if (!onFetchDetail) return undefined;
      const detail = await onFetchDetail(id);
      return detail as any as ToolDetailResponseType;
    },
    {
      manual: true,
      errorToast: ''
    }
  );

  // 自动获取工具详情
  useEffect(() => {
    if (toolId && autoFetch && onFetchDetail) {
      fetchToolDetail(toolId);
    }
  }, [toolId, autoFetch]);

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
      if (!readmeUrl) return;

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
