import type {
  SkillOptionItemType,
  SkillItemType,
  SkillOptionPageLoader,
  SkillOptionPageType
} from '@fastgpt/web/components/common/Textarea/PromptEditor/plugins/SkillPickerPlugin';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useTranslation } from 'next-i18next';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  getToolConfigStatus,
  validateToolConfiguration
} from '@fastgpt/global/core/app/formEdit/utils';
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
  getClientToolPreviewNode,
  getTeamAppTemplatesV2
} from '@/web/core/app/api/tool';
import { AppTypeEnum, AppTypeList, ToolTypeList } from '@fastgpt/global/core/app/constants';
import { useLatest } from 'ahooks';
import { SubAppIds, systemSubInfo } from '@fastgpt/global/core/workflow/node/agent/constants';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import { AGENT_SANDBOX_TOOLSET_ID } from '@fastgpt/global/core/ai/sandbox/tools';
import type { SkillClickResult } from '@fastgpt/web/components/common/Textarea/PromptEditor/plugins/SkillPickerPlugin';
import { getSkillListV2 } from '@/web/core/skill/api';
import { AgentSkillTypeEnum } from '@fastgpt/global/core/ai/skill/constants';
import type { ListSkillsResponse } from '@fastgpt/global/core/ai/skill/api';
import { inheritToolInputConfig } from '../../FormComponent/ToolSelector/utils';
import { getToolIdentityKey } from '@fastgpt/global/core/app/tool/utils';

const ConfigToolModal = dynamic(() => import('../../component/ConfigToolModal'));
type AgentSkillListItemType = ListSkillsResponse['list'][number];
type SkillPickerPageParams = Parameters<SkillOptionPageLoader>[0];
const SKILL_PICKER_PAGE_SIZE = 50;

const getSkillId = (id?: string, source?: string) =>
  source ? getToolIdentityKey(id, source) : id || '';

const isSubApp = (flowNodeType: FlowNodeTypeEnum) => {
  const subAppTypeMap: Record<string, boolean> = {
    [FlowNodeTypeEnum.toolSet]: true,
    [FlowNodeTypeEnum.tool]: true,
    [FlowNodeTypeEnum.appModule]: true,
    [FlowNodeTypeEnum.pluginModule]: true
  };
  return subAppTypeMap[flowNodeType];
};

const toSkillLabelItem = (
  tool: SelectedToolItemType,
  configStatus: SkillLabelItemType['configStatus']
): SkillLabelItemType => ({
  ...tool,
  id: getSkillId(tool.pluginId, tool.source),
  name: tool.name,
  configStatus
});

const toSystemToolItem = (item: NodeTemplateListItemType, parentId?: string): SkillItemType => {
  const isFolder = item.isFolder || item.flowNodeType === FlowNodeTypeEnum.toolSet;

  return {
    parentId: item.parentId ?? parentId,
    id: item.id,
    source: item.source,
    label: item.name,
    icon: item.avatar,
    description: item.intro,
    isFolder,
    canClick: !isFolder
  };
};

const toTeamAppItem = (item: NodeTemplateListItemType, parentId?: string): SkillItemType => {
  const isFolder = item.isFolder ?? false;

  return {
    parentId: item.parentId ?? parentId,
    id: item.id,
    source: item.source,
    label: item.name,
    icon: item.avatar,
    description: item.intro,
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

const toAgentSkillLabelItem = (skill: SelectedAgentSkillItemType): SkillLabelItemType => ({
  id: skill.skillId,
  name: skill.name,
  avatar: skill.avatar || 'core/skill/default',
  intro: skill.description,
  flowNodeType: FlowNodeTypeEnum.tool,
  configStatus: skill.isDeleted ? 'invalid' : 'noConfig'
});

export const useSkillManager = ({
  selectedTools,
  selectedAgentSkills = [],
  onUpdateOrAddTool,
  onAddAgentSkill,
  canUploadFile,
  hasSelectedDataset,
  useAgentSandbox,
  onClickDatasetSearch
}: {
  selectedTools: SelectedToolItemType[];
  selectedAgentSkills?: SelectedAgentSkillItemType[];
  onDeleteTool: (id: string, source?: string) => void;
  onUpdateOrAddTool: (tool: SelectedToolItemType) => void;
  onAddAgentSkill?: (skill: SelectedAgentSkillItemType) => boolean;
  canUploadFile: boolean;
  hasSelectedDataset: boolean;
  useAgentSandbox: boolean;
  onClickDatasetSearch?: () => void;
}) => {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();

  /* ===== System tool ===== */
  const onFolderLoadSystemTools = useCallback(
    async (
      folderId: string,
      source: string | undefined,
      { offset, pageSize }: SkillPickerPageParams
    ): Promise<SkillOptionPageType> => {
      const data = await getAppToolTemplates({ parentId: folderId, source });
      return {
        list: data.slice(offset, offset + pageSize).map((item) => toSystemToolItem(item, folderId)),
        total: data.length
      };
    },
    []
  );

  const { data: systemTools = [] } = useRequest(
    async () => {
      const data = await getAppToolTemplates({ getAll: true }).catch(() => {
        return [];
      });
      const apiTools = data.map((item) => toSystemToolItem(item));

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
      if (sandboxToolInfo) {
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
      manual: false
    }
  );
  const onLoadSystemTool = useCallback(
    async ({}: { searchKey?: string }) => {
      return systemTools;
    },
    [systemTools]
  );

  /* ===== Team agents/tools ===== */
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
          type: types,
          ...params
        },
        cancelToken
      );
      return {
        list: response.list.map((item) => toTeamAppItem(item, parentId ?? undefined)),
        total: response.total
      };
    },
    []
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
          offset,
          pageSize,
          withAppCount: false
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
  const onAddSkill = useCallback(
    async (skillId: string): Promise<SkillClickResult | undefined> => {
      const existsSkill = lastSelectedAgentSkills.current?.find((item) => item.skillId === skillId);
      if (existsSkill) {
        const skill = toAgentSkillLabelItem(existsSkill);

        return {
          id: skill.id,
          skill
        };
      }

      const targetSkill = agentSkillMapRef.current.get(skillId);

      if (!targetSkill) return;

      const selectedSkill: SelectedAgentSkillItemType = {
        skillId: targetSkill._id,
        name: targetSkill.name,
        description: targetSkill.description,
        avatar: targetSkill.avatar,
        isDeleted: false
      };
      if (!onAddAgentSkill?.(selectedSkill)) return;
      const skill = toAgentSkillLabelItem(selectedSkill);

      return {
        id: skill.id,
        skill
      };
    },
    [lastSelectedAgentSkills, onAddAgentSkill]
  );

  const onAddAppOrTool = useCallback(
    async (toolId: string, source?: string): Promise<SkillClickResult | undefined> => {
      // Check tool exists, if exists, not update/add tool
      const toolIdentityKey = getToolIdentityKey(toolId, source);
      const existsTool = lastSelectedTools.current?.find(
        (tool) => getToolIdentityKey(tool.pluginId, tool.source) === toolIdentityKey
      );
      if (existsTool) {
        const skill = toSkillLabelItem(
          existsTool,
          getToolConfigStatus({ tool: existsTool }).status
        );

        return {
          id: skill.id,
          skill
        };
      }

      // Check if it's a sub agent tool
      if (toolId in systemSubInfo) {
        const subToolInfo = systemSubInfo[toolId as keyof typeof systemSubInfo];

        if (!subToolInfo) return;

        const configStatus: SkillLabelItemType['configStatus'] = (() => {
          if (toolId === SubAppIds.datasetSearch) {
            return hasSelectedDataset ? 'configured' : 'waitingForConfig';
          }

          if (toolId === SubAppIds.readFiles) {
            return canUploadFile ? 'configured' : 'invalid';
          }

          if (toolId === AGENT_SANDBOX_TOOLSET_ID) {
            return useAgentSandbox ? 'noConfig' : 'invalid';
          }

          return 'noConfig';
        })();

        const skill: SkillLabelItemType = {
          id: toolId,
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

      const toolTemplate = await getClientToolPreviewNode({
        appId: toolId,
        getLatestVersion: true,
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
      const configStatus = getToolConfigStatus({ tool }).status;
      const skill = toSkillLabelItem(tool, configStatus);

      onUpdateOrAddTool({
        ...tool,
        configStatus
      });

      return {
        id: skill.id,
        skill
      };
    },
    [
      canUploadFile,
      hasSelectedDataset,
      i18n.language,
      lastSelectedTools,
      onUpdateOrAddTool,
      t,
      toast,
      useAgentSandbox
    ]
  );

  /** Lazily load the first page of tools and keep later pages on the same loader. */
  const loadMyTools = useCallback(async () => {
    const types = [AppTypeEnum.toolFolder, ...ToolTypeList];
    const firstPage = await loadRootPage('myTools', () =>
      loadTeamAppPage(null, types, { offset: 0, pageSize: SKILL_PICKER_PAGE_SIZE })
    );

    return {
      description: t('app:space_to_expand_folder'),
      list: firstPage.list,
      total: firstPage.total,
      loadPage: (params: SkillPickerPageParams, cancelToken?: AbortController) =>
        loadTeamAppPage(null, types, params, cancelToken),
      onFolderLoad: (
        folderId: string,
        _source: string | undefined,
        params: SkillPickerPageParams,
        cancelToken?: AbortController
      ) => loadTeamAppPage(folderId, ToolTypeList, params, cancelToken),
      onClick: onAddAppOrTool
    };
  }, [loadRootPage, loadTeamAppPage, onAddAppOrTool, t]);

  /** Lazily load the first page of agents and keep later pages on the same loader. */
  const loadMyAgents = useCallback(async () => {
    const types = [AppTypeEnum.folder, ...AppTypeList];
    const firstPage = await loadRootPage('agent', () =>
      loadTeamAppPage(null, types, { offset: 0, pageSize: SKILL_PICKER_PAGE_SIZE })
    );

    return {
      description: t('app:space_to_expand_folder'),
      list: firstPage.list,
      total: firstPage.total,
      loadPage: (params: SkillPickerPageParams, cancelToken?: AbortController) =>
        loadTeamAppPage(null, types, params, cancelToken),
      onFolderLoad: (
        folderId: string,
        _source: string | undefined,
        params: SkillPickerPageParams,
        cancelToken?: AbortController
      ) => loadTeamAppPage(folderId, AppTypeList, params, cancelToken),
      onClick: onAddAppOrTool
    };
  }, [loadRootPage, loadTeamAppPage, onAddAppOrTool, t]);

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
        } else if (id === 'agentSkill') {
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
        onAddAgentSkill
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
    onAddAppOrTool,
    onAddAgentSkill,
    onLoadSystemTool,
    onFolderLoadSystemTools,
    loadMyTools,
    loadMyAgents,
    loadAgentSkills,
    t
  ]);

  /* ===== Selected skills ===== */
  const selectedSkills = useMemoEnhance<SkillLabelItemType[]>(() => {
    const tools = selectedTools.map((tool) => {
      const configStatus: SkillLabelItemType['configStatus'] = (() => {
        if (tool.pluginData?.error) {
          return 'invalid';
        }
        if (tool.pluginId === SubAppIds.datasetSearch) {
          return hasSelectedDataset ? 'configured' : 'waitingForConfig';
        }
        return getToolConfigStatus({ tool }).status;
      })();

      return {
        ...tool,
        id: getSkillId(tool.pluginId, tool.source),
        name: tool.name,
        configStatus
      };
    });

    const datasetSearchInfo = systemSubInfo[SubAppIds.datasetSearch];
    if (datasetSearchInfo) {
      tools.push({
        id: SubAppIds.datasetSearch,
        pluginId: SubAppIds.datasetSearch,
        name: parseI18nString(datasetSearchInfo.name, i18n.language),
        avatar: datasetSearchInfo.avatar,
        intro: datasetSearchInfo.toolDescription,
        flowNodeType: FlowNodeTypeEnum.tool,
        templateType: FlowNodeTemplateTypeEnum.tools,
        inputs: [],
        outputs: [],
        configStatus: hasSelectedDataset ? 'configured' : 'waitingForConfig'
      });
    }

    const readFilesInfo = systemSubInfo[SubAppIds.readFiles];
    if (readFilesInfo) {
      tools.push({
        id: SubAppIds.readFiles,
        pluginId: SubAppIds.readFiles,
        name: parseI18nString(readFilesInfo.name, i18n.language),
        avatar: readFilesInfo.avatar,
        intro: readFilesInfo.toolDescription,
        flowNodeType: FlowNodeTypeEnum.tool,
        templateType: FlowNodeTemplateTypeEnum.tools,
        inputs: [],
        outputs: [],
        configStatus: canUploadFile ? 'configured' : 'invalid'
      });
    }

    // Merge sandbox tool
    const sandboxToolInfo = systemSubInfo[AGENT_SANDBOX_TOOLSET_ID];
    if (sandboxToolInfo) {
      tools.push({
        id: AGENT_SANDBOX_TOOLSET_ID,
        pluginId: AGENT_SANDBOX_TOOLSET_ID,
        name: parseI18nString(sandboxToolInfo.name, i18n.language),
        avatar: sandboxToolInfo.avatar,
        intro: sandboxToolInfo.toolDescription,
        flowNodeType: FlowNodeTypeEnum.tool,
        templateType: FlowNodeTemplateTypeEnum.tools,
        inputs: [],
        outputs: [],
        configStatus: useAgentSandbox ? 'noConfig' : 'invalid'
      });
    }

    return [...tools, ...selectedAgentSkills.map(toAgentSkillLabelItem)];
  }, [
    selectedTools,
    selectedAgentSkills,
    canUploadFile,
    hasSelectedDataset,
    useAgentSandbox,
    i18n.language
  ]);

  const [configTool, setConfigTool] = useState<SelectedToolItemType>();
  const onClickSkill = useCallback(
    (id: string) => {
      if (selectedAgentSkills.some((skill) => skill.skillId === id)) {
        return;
      }

      if (id === SubAppIds.datasetSearch) {
        onClickDatasetSearch?.();
        return;
      }

      const tool = selectedTools.find((tool) => getSkillId(tool.pluginId, tool.source) === id);
      if (!tool) return;

      if (isSubApp(tool.flowNodeType)) {
        setConfigTool(tool);
      }
    },
    [onClickDatasetSearch, selectedAgentSkills, selectedTools]
  );
  const onRemoveSkill = useCallback(() => {}, []);

  const SkillModal = useCallback(() => {
    return (
      <>
        {!!configTool && (
          <ConfigToolModal
            configTool={configTool}
            onCloseConfigTool={() => setConfigTool(undefined)}
            onAddTool={(tool) =>
              onUpdateOrAddTool({
                ...tool,
                configStatus: 'configured'
              })
            }
          />
        )}
      </>
    );
  }, [configTool, onUpdateOrAddTool]);

  return {
    skillOption,
    selectedSkills,
    onClickSkill,
    onRemoveSkill,
    SkillModal
  };
};
