import type {
  SkillOptionItemType,
  SkillItemType,
  SkillOptionPageLoader,
  SkillOptionPageType
} from '@fastgpt/web/components/common/Textarea/PromptEditor/plugins/SkillPickerPlugin';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useTranslation } from 'next-i18next';
import { useCallback, useMemo, useRef, useState } from 'react';
import { validateToolConfiguration } from '@fastgpt/global/core/app/formEdit/utils';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { FlowNodeTemplateTypeEnum } from '@fastgpt/global/core/workflow/constants';
import type { NodeTemplateListItemType } from '@fastgpt/global/core/workflow/type/node';
import type { SkillLabelItemType } from '@fastgpt/web/components/common/Textarea/PromptEditor/plugins/SkillLabelPlugin';
import dynamic from 'next/dynamic';
import type {
  SelectedAgentSkillItemType,
  SelectedToolItemType
} from '@fastgpt/global/core/app/formEdit/type';
import {
  getAppToolTemplates,
  getNewToolPreviewNode,
  getTeamAppTemplatesV2
} from '@/web/core/app/api/tool';
import { AppTypeEnum, AppTypeList, ToolTypeList } from '@fastgpt/global/core/app/constants';
import { useLatest } from 'ahooks';
import { SubAppIds, systemSubInfo } from '@fastgpt/global/core/workflow/node/agent/constants';
import { parseI18nString, selectPluginText } from '@fastgpt/global/common/i18n/utils';
import { AGENT_SANDBOX_TOOLSET_ID } from '@fastgpt/global/core/ai/sandbox/tools';
import type { SkillClickResult } from '@fastgpt/web/components/common/Textarea/PromptEditor/plugins/SkillPickerPlugin';
import { getSkillListV2 } from '@/web/core/skill/api';
import { AgentSkillTypeEnum } from '@fastgpt/global/core/ai/skill/constants';
import type { ListSkillsResponse } from '@fastgpt/global/core/ai/skill/api';
import { inheritToolInputConfig } from '../../FormComponent/ToolSelector/utils';
import { getToolIdentityKey } from '@fastgpt/global/core/app/tool/utils';
import { useAgentSandboxCapability } from '../../../hooks/useAgentSandboxCapability';
import { formatRefKey } from '@fastgpt/global/core/workflow/node/agent/promptRef/codec';
import {
  getCanonicalKeyForTool,
  getPromptRefToolId
} from '@fastgpt/global/core/workflow/node/agent/promptRef/adapters';
import {
  buildAgentSkillLabelItem,
  buildToolSkillLabelItem,
  useAgentPromptRefs
} from './useAgentPromptRefs';

const ConfigToolModal = dynamic(() => import('../../component/ConfigToolModal'));
type AgentSkillListItemType = ListSkillsResponse['list'][number];
type SkillPickerPageParams = Parameters<SkillOptionPageLoader>[0];
const SKILL_PICKER_PAGE_SIZE = 20;

const isSubApp = (flowNodeType: FlowNodeTypeEnum) => {
  const subAppTypeMap: Record<string, boolean> = {
    [FlowNodeTypeEnum.toolSet]: true,
    [FlowNodeTypeEnum.tool]: true,
    [FlowNodeTypeEnum.appModule]: true,
    [FlowNodeTypeEnum.pluginModule]: true
  };
  return subAppTypeMap[flowNodeType];
};

/** 系统工具与团队应用共用目录项转换，保留来源与文件夹的点击约定。 */
const toToolItem = ({
  item,
  parentId,
  lang
}: {
  item: NodeTemplateListItemType;
  parentId?: string;
  lang: string;
}): SkillItemType => {
  const isFolder = item.isFolder ?? false;

  return {
    parentId: item.parentId ?? parentId,
    id: item.id,
    source: item.source,
    label: selectPluginText(item.name, lang),
    icon: item.avatar,
    description: selectPluginText(item.intro, lang),
    isFolder,
    canClick: !isFolder
  };
};

const toAgentSkillItem = (item: AgentSkillListItemType): SkillItemType => {
  const isFolder = item.type === AgentSkillTypeEnum.folder;

  return {
    id: item._id,
    label: item.name,
    icon: item.avatar || (isFolder ? 'common/folderFill' : 'core/skill/default'),
    description: item.description,
    isFolder,
    canClick: item.type === AgentSkillTypeEnum.skill
  };
};

/** 表单与工作流共用提示词资源目录、即时状态和工具配置；通过回调更新各自的编辑数据。 */
export const useSkillManager = ({
  selectedTools,
  selectedAgentSkills = [],
  onUpdateOrAddTool,
  onAddAgentSkill,
  onEnableSandbox,
  canUploadFile,
  hasSelectedDataset,
  useAgentSandbox,
  currentAppId,
  onClickDatasetSearch
}: {
  selectedTools: SelectedToolItemType[];
  selectedAgentSkills?: SelectedAgentSkillItemType[];
  onUpdateOrAddTool: (tool: SelectedToolItemType) => void;
  onAddAgentSkill?: (skill: SelectedAgentSkillItemType) => boolean;
  onEnableSandbox?: () => void;
  canUploadFile: boolean;
  hasSelectedDataset: boolean;
  useAgentSandbox: boolean;
  currentAppId?: string;
  onClickDatasetSearch?: () => void;
}) => {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const { canUseSandbox: isSandboxSupported } = useAgentSandboxCapability();
  const effectiveUseAgentSandbox = isSandboxSupported && useAgentSandbox;
  const { promptRefRegistry, getToolWriteKey, getSkillWriteKey, getBuiltinWriteKey } =
    useAgentPromptRefs({
      selectedTools,
      selectedAgentSkills,
      canUploadFile,
      hasSelectedDataset,
      useAgentSandbox: effectiveUseAgentSandbox,
      lang: i18n.language
    });

  /* ===== System tool ===== */
  const onFolderLoadSystemTools = useCallback(
    async (
      folderId: string,
      source: string | undefined,
      { offset, pageSize }: SkillPickerPageParams
    ): Promise<SkillOptionPageType> => {
      const data = await getAppToolTemplates({ parentId: folderId, source });
      return {
        list: data
          .slice(offset, offset + pageSize)
          .map((item) => toToolItem({ item, parentId: folderId, lang: i18n.language })),
        total: data.length
      };
    },
    [i18n.language]
  );

  const { data: systemTools = [] } = useRequest(
    async () => {
      const data = await getAppToolTemplates({ getAll: true }).catch(() => {
        return [];
      });
      const apiTools = data.map((item) => toToolItem({ item, lang: i18n.language }));

      const datasetSearchInfo = systemSubInfo[SubAppIds.datasetSearch];
      if (datasetSearchInfo) {
        apiTools.unshift({
          id: SubAppIds.datasetSearch,
          label: parseI18nString(datasetSearchInfo.name, i18n.language),
          icon: datasetSearchInfo.avatar,
          description: datasetSearchInfo.toolDescription,
          canClick: true
        });
      }

      const readFilesInfo = systemSubInfo[SubAppIds.readFiles];
      if (readFilesInfo) {
        apiTools.unshift({
          id: SubAppIds.readFiles,
          label: parseI18nString(readFilesInfo.name, i18n.language),
          icon: readFilesInfo.avatar,
          description: readFilesInfo.toolDescription,
          canClick: true
        });
      }

      const sandboxToolInfo = systemSubInfo[AGENT_SANDBOX_TOOLSET_ID];
      if (sandboxToolInfo && isSandboxSupported) {
        apiTools.unshift({
          id: AGENT_SANDBOX_TOOLSET_ID,
          label: parseI18nString(sandboxToolInfo.name, i18n.language),
          icon: sandboxToolInfo.avatar,
          description: sandboxToolInfo.toolDescription,
          canClick: true
        });
      }

      return apiTools;
    },
    {
      manual: false,
      refreshDeps: [i18n.language, isSandboxSupported]
    }
  );
  const onLoadSystemTool = useCallback(
    async ({}: { searchKey?: string }) => {
      return systemTools;
    },
    [systemTools]
  );

  /* ===== Team agents/tools ===== */
  const parentTypes = useRef(new Map<string, AppTypeEnum>());
  const loadTeamAppPage = useCallback(
    async (
      parentId: string | null,
      types: AppTypeEnum[],
      params: SkillPickerPageParams,
      cancelToken?: AbortController
    ): Promise<SkillOptionPageType> => {
      const response = await getTeamAppTemplatesV2(
        {
          parentId,
          parentType: parentId ? parentTypes.current.get(parentId) : undefined,
          type: types,
          excludeAppId: currentAppId,
          ...params
        },
        cancelToken
      );
      (response.list as (NodeTemplateListItemType & { appType?: AppTypeEnum })[]).forEach(
        ({ id, appType }) => {
          if (appType) parentTypes.current.set(id, appType);
        }
      );
      return {
        list: response.list.map((item) =>
          toToolItem({ item, parentId: parentId ?? undefined, lang: i18n.language })
        ),
        total: response.total
      };
    },
    [currentAppId, i18n.language]
  );

  const rootListCacheRef = useRef<Map<string, SkillOptionPageType>>(new Map());
  const rootListRequestsRef = useRef<Map<string, Promise<SkillOptionPageType>>>(new Map());
  /** Cache the first page while sharing an in-flight request per category. */
  const loadRootPage = useCallback((key: string, loader: () => Promise<SkillOptionPageType>) => {
    if (rootListCacheRef.current.has(key)) {
      return Promise.resolve(rootListCacheRef.current.get(key)!);
    }

    const pendingRequest = rootListRequestsRef.current.get(key);
    if (pendingRequest) return pendingRequest;

    const request = loader()
      .then((page) => {
        rootListCacheRef.current.set(key, page);
        return page;
      })
      .finally(() => {
        rootListRequestsRef.current.delete(key);
      });

    rootListRequestsRef.current.set(key, request);
    return request;
  }, []);

  /* ===== Agent skills ===== */
  const agentSkillMapRef = useRef<Map<string, AgentSkillListItemType>>(new Map());
  const cacheAgentSkillList = useCallback((list: AgentSkillListItemType[]) => {
    list.forEach((item) => {
      if (item.type === AgentSkillTypeEnum.skill) {
        agentSkillMapRef.current.set(item._id, item);
      }
    });

    return list.map(toAgentSkillItem);
  }, []);

  const onFolderLoadAgentSkills = useCallback(
    async (
      folderId: string,
      _source: string | undefined,
      { offset, pageSize }: SkillPickerPageParams,
      cancelToken?: AbortController
    ): Promise<SkillOptionPageType> => {
      const response = await getSkillListV2(
        {
          source: 'mine',
          parentId: folderId,
          withAppCount: false,
          offset,
          pageSize
        },
        cancelToken
      );
      return {
        list: cacheAgentSkillList(response.list),
        total: response.total
      };
    },
    [cacheAgentSkillList]
  );

  const lastSelectedTools = useLatest(selectedTools);
  const lastSelectedAgentSkills = useLatest(selectedAgentSkills);
  const lastOnAddAgentSkill = useLatest(onAddAgentSkill);
  const lastOnUpdateOrAddTool = useLatest(onUpdateOrAddTool);
  const lastOnEnableSandbox = useLatest(onEnableSandbox);
  const hasAgentSkillSupport = Boolean(onAddAgentSkill) && isSandboxSupported;
  const onAddSkill = useCallback(
    async (skillId: string): Promise<SkillClickResult | undefined> => {
      if (!hasAgentSkillSupport) return;
      const existsSkill = lastSelectedAgentSkills.current?.find((item) => item.skillId === skillId);
      if (existsSkill) {
        const writeKey = getSkillWriteKey({
          skillId: existsSkill.skillId,
          source: existsSkill.source
        });
        const skill = buildAgentSkillLabelItem({ skill: existsSkill, writeKey });

        return {
          id: skill.id,
          skill
        };
      }

      const targetSkill = agentSkillMapRef.current.get(skillId);

      if (!targetSkill) return;

      const selectedSkill: SelectedAgentSkillItemType = {
        skillId: targetSkill._id,
        source: targetSkill.source,
        name: targetSkill.name,
        description: targetSkill.description,
        avatar: targetSkill.avatar
      };
      if (!lastOnAddAgentSkill.current?.(selectedSkill)) return;
      const writeKey = getSkillWriteKey({
        skillId: selectedSkill.skillId,
        source: selectedSkill.source
      });
      const skill = buildAgentSkillLabelItem({ skill: selectedSkill, writeKey });

      return {
        id: skill.id,
        skill
      };
    },
    [getSkillWriteKey, hasAgentSkillSupport, lastOnAddAgentSkill, lastSelectedAgentSkills]
  );

  const onAddAppOrTool = useCallback(
    async (toolId: string, source?: string): Promise<SkillClickResult | undefined> => {
      // 按实际解析身份判重，避免旧菜单项误命中经历史候选回退加载出的同名末段工具。
      const toolIdentityKey = getToolIdentityKey(toolId, source);
      const existsTool = lastSelectedTools.current?.find(
        (tool) => getToolIdentityKey(getPromptRefToolId(tool), tool.source) === toolIdentityKey
      );
      if (existsTool) {
        const writeKey = getToolWriteKey({
          id: existsTool.id,
          pluginId: existsTool.pluginId,
          flowNodeType: existsTool.flowNodeType,
          toolConfig: existsTool.toolConfig,
          source: existsTool.source
        });
        const skill = buildToolSkillLabelItem({ tool: existsTool, writeKey });

        return {
          id: skill.id,
          skill
        };
      }

      // Check if it's a sub agent tool
      if (toolId in systemSubInfo) {
        const subToolInfo = systemSubInfo[toolId as keyof typeof systemSubInfo];

        if (!subToolInfo) return;

        // 提示词 @虚拟机 时，同步尝试打开虚拟机开关。
        if (toolId === AGENT_SANDBOX_TOOLSET_ID) {
          if (!isSandboxSupported) return;
          if (!useAgentSandbox) {
            lastOnEnableSandbox.current?.();
          }
        }

        const configStatus: SkillLabelItemType['configStatus'] = (() => {
          if (toolId === SubAppIds.datasetSearch) {
            return hasSelectedDataset ? 'configured' : 'waitingForConfig';
          }

          if (toolId === SubAppIds.readFiles) {
            return canUploadFile ? 'configured' : 'invalid';
          }

          if (toolId === AGENT_SANDBOX_TOOLSET_ID) {
            return 'noConfig';
          }

          return 'noConfig';
        })();

        const writeKey = getBuiltinWriteKey(toolId);
        const skill: SkillLabelItemType = {
          id: writeKey,
          pluginId: toolId,
          name: parseI18nString(subToolInfo.name, i18n.language),
          avatar: subToolInfo.avatar,
          intro: subToolInfo.toolDescription,
          flowNodeType: FlowNodeTypeEnum.tool,
          templateType: FlowNodeTemplateTypeEnum.tools,
          inputs: [],
          outputs: [],
          configStatus
        };

        return {
          id: skill.id,
          skill
        };
      }

      const toolTemplate = await getNewToolPreviewNode({
        appId: toolId,
        source
      });

      const toolValid = validateToolConfiguration({
        toolTemplate,
        canUploadFile,
        isAppTool: true
      });
      if (!toolValid) {
        toast({
          title: t('app:simple_tool_tips'),
          status: 'warning'
        });
        return;
      }

      const tool = inheritToolInputConfig({
        tool: {
          ...toolTemplate,
          id: toolTemplate.pluginId!
        }
      });
      const writeKey = getToolWriteKey({
        id: tool.id,
        pluginId: tool.pluginId,
        flowNodeType: tool.flowNodeType,
        toolConfig: tool.toolConfig,
        source: tool.source ?? source
      });
      const requestedCanonicalKey = getCanonicalKeyForTool({ id: toolId, source });
      if (
        (toolId.startsWith('mcp-') || toolId.startsWith('http-')) &&
        requestedCanonicalKey &&
        writeKey !== requestedCanonicalKey
      ) {
        // 所选旧菜单子工具已被删除且预览仅回退到末段同名工具时，拒绝插入替代工具。
        toast({
          title: t('common:core.workflow.check.tool_missing'),
          status: 'warning'
        });
        return;
      }
      const skill = buildToolSkillLabelItem({ tool, writeKey });

      lastOnUpdateOrAddTool.current?.(tool);

      return {
        id: skill.id,
        skill
      };
    },
    [
      canUploadFile,
      getBuiltinWriteKey,
      getToolWriteKey,
      hasSelectedDataset,
      i18n.language,
      isSandboxSupported,
      lastOnEnableSandbox,
      lastOnUpdateOrAddTool,
      lastSelectedTools,
      t,
      toast,
      useAgentSandbox
    ]
  );

  /** Lazily load the first page of tools and keep later pages on the same loader. */
  const loadMyTools = useCallback(async () => {
    const types = [AppTypeEnum.toolFolder, ...ToolTypeList];
    const firstPage = await loadRootPage(`myTools:${i18n.language}`, () =>
      loadTeamAppPage(null, types, { offset: 0, pageSize: SKILL_PICKER_PAGE_SIZE })
    );

    return {
      description: t('app:space_to_expand_folder'),
      list: firstPage.list,
      total: firstPage.total,
      folderExpandMode: 'manual' as const,
      loadPage: (params: SkillPickerPageParams, cancelToken?: AbortController) =>
        loadTeamAppPage(null, types, params, cancelToken),
      onFolderLoad: (
        folderId: string,
        _source: string | undefined,
        params: SkillPickerPageParams,
        cancelToken?: AbortController
      ) => loadTeamAppPage(folderId, types, params, cancelToken),
      onClick: onAddAppOrTool
    };
  }, [i18n.language, loadRootPage, loadTeamAppPage, onAddAppOrTool, t]);

  /** Lazily load the first page of agents and keep later pages on the same loader. */
  const loadMyAgents = useCallback(async () => {
    const types = [AppTypeEnum.folder, ...AppTypeList];
    const firstPage = await loadRootPage(`agent:${i18n.language}`, () =>
      loadTeamAppPage(null, types, { offset: 0, pageSize: SKILL_PICKER_PAGE_SIZE })
    );

    return {
      description: t('app:space_to_expand_folder'),
      list: firstPage.list,
      total: firstPage.total,
      folderExpandMode: 'manual' as const,
      loadPage: (params: SkillPickerPageParams, cancelToken?: AbortController) =>
        loadTeamAppPage(null, types, params, cancelToken),
      onFolderLoad: (
        folderId: string,
        _source: string | undefined,
        params: SkillPickerPageParams,
        cancelToken?: AbortController
      ) => loadTeamAppPage(folderId, types, params, cancelToken),
      onClick: onAddAppOrTool
    };
  }, [i18n.language, loadRootPage, loadTeamAppPage, onAddAppOrTool, t]);

  /** Lazily load the first page of associated skills and update the lookup map. */
  const loadAgentSkills = useCallback(async () => {
    const loadPage = async (
      params: SkillPickerPageParams,
      cancelToken?: AbortController
    ): Promise<SkillOptionPageType> => {
      const response = await getSkillListV2(
        {
          source: 'mine',
          parentId: null,
          withAppCount: false,
          ...params
        },
        cancelToken
      );
      return {
        list: cacheAgentSkillList(response.list),
        total: response.total
      };
    };
    const firstPage = await loadRootPage('agentSkill', () =>
      loadPage({ offset: 0, pageSize: SKILL_PICKER_PAGE_SIZE })
    );

    return {
      description: t('app:space_to_expand_folder'),
      list: firstPage.list,
      total: firstPage.total,
      loadPage,
      onFolderLoad: onFolderLoadAgentSkills,
      onClick: onAddSkill
    };
  }, [cacheAgentSkillList, loadRootPage, onAddSkill, onFolderLoadAgentSkills, t]);

  /* ===== Skill option ===== */
  const skillOption = useMemo<SkillOptionItemType>(() => {
    return {
      onSelect: async (id: string) => {
        if (id === 'systemTool') {
          const data = await onLoadSystemTool({});
          return {
            list: data,
            onFolderLoad: onFolderLoadSystemTools,
            onClick: onAddAppOrTool
          };
        } else if (id === 'myTools') {
          return loadMyTools();
        } else if (id === 'agent') {
          return loadMyAgents();
        } else if (id === 'agentSkill' && hasAgentSkillSupport) {
          return loadAgentSkills();
        }
        return undefined;
      },
      list: [
        {
          id: 'systemTool',
          label: t('app:core.module.template.System Tools'),
          icon: 'core/workflow/template/toolCall',
          canClick: false
        },
        {
          id: 'myTools',
          label: t('common:navbar.Tools'),
          icon: 'core/app/type/pluginFill',
          canClick: false
        },
        {
          id: 'agent',
          label: t('app:my_agents'),
          icon: 'core/workflow/template/runApp',
          canClick: false
        }
      ].concat(
        hasAgentSkillSupport
          ? [
              {
                id: 'agentSkill',
                label: t('skill:associated_skills'),
                icon: 'core/skill/default',
                canClick: false
              }
            ]
          : []
      )
    };
  }, [
    hasAgentSkillSupport,
    onAddAppOrTool,
    onLoadSystemTool,
    onFolderLoadSystemTools,
    loadMyTools,
    loadMyAgents,
    loadAgentSkills,
    t
  ]);

  const [configTool, setConfigTool] = useState<SelectedToolItemType>();
  const onClickSkill = useCallback(
    (rawKey: string) => {
      const resolved = promptRefRegistry.resolve(rawKey);
      if (resolved.status !== 'resolved') return;

      const { ref, canonicalKey } = resolved.entry;
      if (ref.type === 'skill') {
        return;
      }

      if (ref.type === 'builtin' && ref.id === SubAppIds.datasetSearch) {
        onClickDatasetSearch?.();
        return;
      }

      const parentCanonicalKey =
        (ref.type === 'plugin' || ref.type === 'app') && ref.childId
          ? formatRefKey({
              ...ref,
              id: ref.parentId,
              childId: undefined
            })
          : undefined;
      const tool = selectedTools.find((item) => {
        const itemKey = getCanonicalKeyForTool({
          id: getPromptRefToolId(item),
          source: item.source
        });
        return (
          itemKey === canonicalKey ||
          (parentCanonicalKey !== undefined && itemKey === parentCanonicalKey)
        );
      });
      if (!tool) return;

      if (isSubApp(tool.flowNodeType)) {
        setConfigTool(tool);
      }
    },
    [onClickDatasetSearch, promptRefRegistry, selectedTools]
  );
  return {
    skillOption,
    promptRefRegistry,
    onClickSkill,
    onOpenConfigTool: setConfigTool,
    toolConfigModal: configTool ? (
      <ConfigToolModal
        configTool={configTool}
        onCloseConfigTool={() => setConfigTool(undefined)}
        onAddTool={onUpdateOrAddTool}
      />
    ) : null
  };
};
