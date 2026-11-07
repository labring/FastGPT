import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'next-i18next';
import type {
  ToolDetailFetchResponse,
  ToolDetailResponseType,
  ToolDetailExtendedType
} from './types';
import {
  JSONSchemaInputTypeSchema,
  JSONSchemaOutputTypeSchema,
  jsonSchema2NodeInput,
  jsonSchema2NodeOutput,
  jsonSchema2SecretInput
} from '@fastgpt/global/core/app/jsonschema';
import { selectReadmeUrl } from '@fastgpt/global/common/i18n/utils';
import { MarketplaceToolDetailSchema } from '@fastgpt/global/openapi/core/plugin/marketplace/api';
import {
  SystemToolDetailSchema,
  type SystemToolChildDetailType,
  type SystemToolDetailType
} from '@fastgpt/global/core/app/tool/systemTool/type/base';
import type { GetMarketplaceToolDetailResponseType } from '@fastgpt/global/openapi/core/plugin/marketplace/api';
import { useRequest } from '../../../../../hooks/useRequest';
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
  detail?: ToolDetailFetchResponse;
};

const getToolDetailRequestKey = (toolId?: string, version?: string) =>
  `${toolId ?? ''}\u0000${version ?? ''}`;
type MarketplaceToolItem = GetMarketplaceToolDetailResponseType['tools'][number];

const normalizeMarketplaceTool = (
  tool: MarketplaceToolItem,
  lang: string
): ToolDetailExtendedType => {
  const inputSchema = JSONSchemaInputTypeSchema.safeParse(tool.inputSchema);
  const outputSchema = JSONSchemaOutputTypeSchema.safeParse(tool.outputSchema);
  const secretSchema = JSONSchemaInputTypeSchema.safeParse(tool.secretSchema);
  const inputs = inputSchema.success
    ? jsonSchema2NodeInput({
        jsonSchema: inputSchema.data,
        schemaType: 'systemTool',
        lang
      })
    : [];
  const outputs = outputSchema.success
    ? jsonSchema2NodeOutput({ jsonSchema: outputSchema.data, lang })
    : [];

  return {
    ...tool,
    pluginId: tool.pluginId,
    id: tool.id,
    name: tool.name,
    intro: tool.description,
    description: tool.description,
    icon: tool.icon,
    author: tool.author,
    tags: tool.tags,
    hasSystemSecret: Boolean(tool.secretSchema),
    secrets: secretSchema.success
      ? jsonSchema2SecretInput({ jsonSchema: secretSchema.data, lang })
      : undefined,
    inputSchema: inputSchema.success ? inputSchema.data : undefined,
    outputSchema: outputSchema.success ? outputSchema.data : undefined,
    secretSchema: secretSchema.success ? secretSchema.data : undefined,
    inputs,
    outputs,
    courseUrl: tool.tutorialUrl,
    readme: tool.readme,
    readmeUrl: tool.readmeUrl,
    readmeUrls: tool.readmeUrls,
    versionList: [{ inputs, outputs }]
  };
};

const normalizeSystemToolDetail = (
  tool: SystemToolDetailType,
  lang: string
): ToolDetailResponseType => {
  const inputs = tool.inputSchema
    ? jsonSchema2NodeInput({ jsonSchema: tool.inputSchema, schemaType: 'systemTool', lang })
    : [];
  const outputs = tool.outputSchema
    ? jsonSchema2NodeOutput({ jsonSchema: tool.outputSchema, lang })
    : [];
  const secrets = tool.secretSchema
    ? jsonSchema2SecretInput({ jsonSchema: tool.secretSchema, lang })
    : undefined;
  const parentTool: ToolDetailExtendedType = {
    pluginId: tool.id,
    id: tool.id,
    version: tool.version,
    name: tool.name,
    intro: tool.intro,
    description: tool.intro,
    icon: tool.avatar,
    avatar: tool.avatar,
    author: tool.author,
    tags: tool.tags,
    currentCost: tool.currentCost,
    systemKeyCost: tool.systemKeyCost,
    hasSystemSecret: tool.hasSystemSecret,
    secrets,
    secretSchema: tool.secretSchema,
    inputSchema: tool.inputSchema,
    outputSchema: tool.outputSchema,
    inputs,
    outputs,
    courseUrl: tool.courseUrl,
    readme: tool.readmeUrl,
    readmeUrl: tool.readmeUrl,
    readmeUrls: tool.readmeUrls,
    userGuide: tool.userGuide,
    versionList: [{ inputs, outputs }]
  };
  const children = (tool.children ?? []).map((child: SystemToolChildDetailType) => {
    const childInputs = child.inputSchema
      ? jsonSchema2NodeInput({ jsonSchema: child.inputSchema, schemaType: 'systemTool', lang })
      : [];
    const childOutputs = child.outputSchema
      ? jsonSchema2NodeOutput({ jsonSchema: child.outputSchema, lang })
      : [];

    return {
      pluginId: `${tool.id}/${child.id}`,
      id: child.id,
      parentId: tool.id,
      version: tool.version,
      name: child.name,
      intro: child.description,
      description: child.description,
      icon: child.icon ?? tool.avatar,
      currentCost: child.currentCost,
      systemKeyCost: child.systemKeyCost,
      inputSchema: child.inputSchema,
      outputSchema: child.outputSchema,
      inputs: childInputs,
      outputs: childOutputs,
      versionList: [{ inputs: childInputs, outputs: childOutputs }]
    } satisfies ToolDetailExtendedType;
  });

  return { tools: [parentTool, ...children] };
};

const normalizeToolDetail = (
  detail: ToolDetailFetchResponse | undefined,
  lang: string
): ToolDetailResponseType | undefined => {
  if (!detail) return undefined;

  const marketplaceDetail = MarketplaceToolDetailSchema.safeParse(detail);
  if (marketplaceDetail.success) {
    return {
      tools: marketplaceDetail.data.tools.map((tool) => normalizeMarketplaceTool(tool, lang)),
      downloadCount: marketplaceDetail.data.downloadCount,
      downloadUrl: marketplaceDetail.data.downloadUrl
    };
  }

  const systemToolDetail = SystemToolDetailSchema.safeParse(detail);
  return systemToolDetail.success
    ? normalizeSystemToolDetail(systemToolDetail.data, lang)
    : undefined;
};
/** Loads raw marketplace metadata and derives display strings for the active UI locale. */
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
          detail
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

  const { i18n } = useTranslation();
  const toolDetail = useMemo(
    () =>
      toolDetailResult?.requestKey === currentRequestKey
        ? normalizeToolDetail(toolDetailResult.detail, i18n.language)
        : undefined,
    [currentRequestKey, i18n.language, toolDetailResult]
  );
  const detailReady =
    !toolId || !autoFetch || !onFetchDetail || toolDetailResult?.requestKey === currentRequestKey;
  const detailError = failedRequestKey === currentRequestKey;
  const loadingDetail = !detailReady && !detailError;

  // Calculate tool structure
  const tools = toolDetail?.tools;
  const isToolSet = Array.isArray(tools) && tools.some((tool) => Boolean(tool.parentId));

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
  const readmeUrl = selectReadmeUrl(
    {
      readmeUrls: parentTool?.readmeUrls,
      readmeUrl: parentTool?.readmeUrl ?? parentTool?.readme
    },
    i18n.language
  );
  const readmeRequestKey = `${currentRequestKey}\u0000${readmeUrl ?? ''}`;

  // README 文档独立加载；语言切换到新 URL 时使用新请求键，避免展示上一语言的内容。
  useEffect(() => {
    let cancelled = false;

    const fetchReadme = async () => {
      if (!toolDetail) return;
      if (!readmeUrl) {
        setReadmeResult({ requestKey: readmeRequestKey, content: '' });
        return;
      }

      try {
        const content = await fetchRemoteMarkdown(readmeUrl);
        if (!cancelled) {
          setReadmeResult({ requestKey: readmeRequestKey, content });
        }
      } catch (error) {
        console.error('Failed to fetch README:', error);
        if (!cancelled) {
          setReadmeResult({ requestKey: readmeRequestKey, content: '' });
        }
      }
    };

    void fetchReadme();

    return () => {
      cancelled = true;
    };
  }, [readmeRequestKey, readmeUrl, toolDetail]);

  const readmeContent = readmeResult?.requestKey === readmeRequestKey ? readmeResult.content : '';
  const loadingReadme = detailReady && !!readmeUrl && readmeResult?.requestKey !== readmeRequestKey;

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
