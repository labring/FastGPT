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
import { fetchRemoteMarkdown } from '../../../../common/Markdown/utils';
import { useMemoizedFn } from 'ahooks';

export type UseToolDetailProps = {
  toolId?: string;
  version?: string;
  tags?: string[];
  onFetchDetail?: (toolId: string, version?: string) => Promise<ToolDetailFetchResponse>;
  autoFetch?: boolean;
};

type ToolDetailRequestResult = {
  requestKey: string;
  detail?: ToolDetailResponseType;
};

const getToolDetailRequestKey = (toolId?: string, version?: string) =>
  `${toolId ?? ''}\u0000${version ?? ''}`;

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

/**
 * 加载并标准化指定工具版本的详情，确保调用方只消费与当前 toolId/version 匹配的数据。
 * README 独立加载，避免较慢的远程文档阻塞基础详情展示。
 */
export const useToolDetail = ({
  toolId,
  version,
  tags,
  onFetchDetail,
  autoFetch = true
}: UseToolDetailProps) => {
  const currentRequestKey = getToolDetailRequestKey(toolId, version);
  const [failedRequestKey, setFailedRequestKey] = useState<string>();
  const [readmeResult, setReadmeResult] = useState<{
    requestKey: string;
    content: string;
  }>();

  // 使用 useRequest2 替代手动的 useEffect，避免无限请求问题
  const { data: toolDetailResult, run: fetchToolDetail } = useRequest(
    async (id: string, version?: string) => {
      if (!onFetchDetail) return undefined;
      const requestKey = getToolDetailRequestKey(id, version);
      setFailedRequestKey((previousKey) => (previousKey === requestKey ? undefined : previousKey));

      try {
        const detail = await onFetchDetail(id, version);
        return {
          requestKey,
          detail: normalizeToolDetail(detail)
        } satisfies ToolDetailRequestResult;
      } catch (error) {
        setFailedRequestKey(requestKey);
        throw error;
      }
    },
    {
      manual: true,
      errorToast: ''
    }
  );

  const refreshDetail = useMemoizedFn(() => {
    if (toolId && autoFetch && onFetchDetail) {
      fetchToolDetail(toolId, version);
    }
  });

  // 自动获取工具详情
  useEffect(() => {
    refreshDetail();
  }, [autoFetch, refreshDetail, toolId, version]);

  const toolDetail =
    toolDetailResult?.requestKey === currentRequestKey ? toolDetailResult.detail : undefined;
  const detailReady =
    !toolId || !autoFetch || !onFetchDetail || toolDetailResult?.requestKey === currentRequestKey;
  const detailError = failedRequestKey === currentRequestKey;
  const loadingDetail = !detailReady && !detailError;

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
    let cancelled = false;

    const fetchReadme = async () => {
      if (!toolDetail) return;
      const readmeUrl = parentTool?.readme;
      if (!readmeUrl) {
        setReadmeResult({ requestKey: currentRequestKey, content: '' });
        return;
      }

      try {
        const content = await fetchRemoteMarkdown(readmeUrl);
        if (!cancelled) {
          setReadmeResult({ requestKey: currentRequestKey, content });
        }
      } catch (error) {
        console.error('Failed to fetch README:', error);
        if (!cancelled) {
          setReadmeResult({ requestKey: currentRequestKey, content: '' });
        }
      }
    };

    void fetchReadme();

    return () => {
      cancelled = true;
    };
  }, [currentRequestKey, toolDetail, parentTool?.readme]);

  const readmeContent = readmeResult?.requestKey === currentRequestKey ? readmeResult.content : '';
  const loadingReadme =
    detailReady && !!parentTool?.readme && readmeResult?.requestKey !== currentRequestKey;

  return {
    toolDetail,
    loadingDetail,
    loadingReadme,
    detailReady,
    detailError,
    refreshDetail,
    readmeContent,
    isToolSet,
    parentTool,
    subTools
  };
};
