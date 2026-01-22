import { useState, useEffect, useMemo } from 'react';
import type { ToolDetailResponseType, ToolDetailExtendedType } from './types';
import type { GetTeamToolDetailResponseType } from '@fastgpt/global/openapi/core/plugin/team/toolApi';

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
  const [toolDetail, setToolDetail] = useState<ToolDetailResponseType | undefined>(undefined);
  const [loadingDetail, setLoading] = useState(false);
  const [readmeContent, setReadmeContent] = useState<string>('');

  // Fetch tool detail
  useEffect(() => {
    const fetchToolDetail = async () => {
      if (onFetchDetail && toolId && autoFetch) {
        setLoading(true);
        try {
          const detail = await onFetchDetail(toolId);
          setToolDetail(detail as any);
        } finally {
          setLoading(false);
        }
      }
    };

    fetchToolDetail();
  }, [toolId, onFetchDetail, autoFetch]);

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
