import type {
  SkillOptionItemType,
  SkillItemType
} from '@fastgpt/web/components/common/Textarea/PromptEditor/plugins/SkillPickerPlugin';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useTranslation } from 'next-i18next';
import { useCallback, useMemo, useState } from 'react';
import {
  checkNeedsUserConfiguration,
  getToolConfigStatus,
  validateToolConfiguration
} from '@fastgpt/global/core/app/formEdit/utils';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { FlowNodeTemplateTypeEnum } from '@fastgpt/global/core/workflow/constants';
import type { SkillLabelItemType } from '@fastgpt/web/components/common/Textarea/PromptEditor/plugins/SkillLabelPlugin';
import dynamic from 'next/dynamic';
import type { SelectedToolItemType } from '@fastgpt/global/core/app/formEdit/type';
import {
  getAppToolTemplates,
  getClientToolPreviewNode,
  getTeamAppTemplates
} from '@/web/core/app/api/tool';
import {
  AppFolderTypeList,
  AppTypeEnum,
  AppTypeList,
  ToolTypeList
} from '@fastgpt/global/core/app/constants';
import { useLatest } from 'ahooks';
import { SubAppIds, systemSubInfo } from '@fastgpt/global/core/workflow/node/agent/constants';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import { AGENT_SANDBOX_TOOLSET_ID } from '@fastgpt/global/core/ai/sandbox/tools';
import type { SkillClickResult } from '@fastgpt/web/components/common/Textarea/PromptEditor/plugins/SkillPickerPlugin';

const ConfigToolModal = dynamic(() => import('../../component/ConfigToolModal'));

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
  id: tool.pluginId!,
  name: tool.name,
  configStatus
});

export const useSkillManager = ({
  selectedTools,
  onUpdateOrAddTool,
  canUploadFile,
  hasSelectedDataset,
  useAgentSandbox
}: {
  selectedTools: SelectedToolItemType[];
  onDeleteTool: (id: string) => void;
  onUpdateOrAddTool: (tool: SelectedToolItemType) => void;
  canUploadFile: boolean;
  hasSelectedDataset: boolean;
  useAgentSandbox: boolean;
}) => {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();

  /* ===== System tool ===== */
  const { data: systemTools = [] } = useRequest(
    async () => {
      const data = await getAppToolTemplates({ getAll: true }).catch(() => {
        return [];
      });
      const apiTools = data
        .map<SkillItemType>((item) => {
          return {
            id: item.id,
            parentId: item.parentId,
            label: item.name,
            icon: item.avatar,
            description: item.intro,
            showArrow: item.isFolder,
            canClick: true,
            tools: data
              .filter((tool) => tool.parentId === item.id)
              .map((tool) => ({
                id: tool.id,
                name: tool.name
              }))
          };
        })
        .filter((item) => !item.parentId);

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
  const { data: allTeamApps = [] } = useRequest(() => getTeamAppTemplates({ parentId: null }), {
    manual: false
  });
  const myTools = useMemo(
    () =>
      allTeamApps
        .filter((item) => [AppTypeEnum.toolFolder, ...ToolTypeList].includes(item.appType))
        .map((item) => ({
          id: item.id,
          label: item.name,
          icon: item.avatar,
          isFolder: item.isFolder ?? false,
          canClick: !AppFolderTypeList.includes(item.appType)
        })),
    [allTeamApps]
  );
  const myAgents = useMemo(
    () =>
      allTeamApps
        .filter((item) => [AppTypeEnum.folder, ...AppTypeList].includes(item.appType))
        .map((item) => ({
          id: item.id,
          label: item.name,
          icon: item.avatar,
          isFolder: item.isFolder ?? false,
          canClick: !AppFolderTypeList.includes(item.appType)
        })),
    [allTeamApps]
  );

  const onFolderLoadTeamApps = useCallback(async (folderId: string, types: AppTypeEnum[]) => {
    const children = await getTeamAppTemplates({ parentId: folderId, type: types });

    if (!children || children.length === 0) {
      return [];
    }

    return children.map<SkillItemType>((item) => {
      return {
        parentId: folderId,
        id: item.id,
        label: item.name,
        icon: item.avatar,
        isFolder: item.isFolder ?? false,
        canClick: !AppFolderTypeList.includes(item.appType)
      };
    });
  }, []);

  const lastSelectedTools = useLatest(selectedTools);
  const onAddAppOrTool = useCallback(
    async (toolId: string): Promise<SkillClickResult | undefined> => {
      // Check tool exists, if exists, not update/add tool
      const existsTool = lastSelectedTools.current?.find((tool) => tool.pluginId === toolId);
      if (existsTool) {
        const skill = toSkillLabelItem(existsTool, existsTool.configStatus || 'waitingForConfig');

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
            return hasSelectedDataset ? 'configured' : 'invalid';
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

      const toolTemplate = await getClientToolPreviewNode({ appId: toolId, versionId: '' });

      const toolValid = validateToolConfiguration({
        toolTemplate,
        canUploadFile
      });
      if (!toolValid) {
        toast({
          title: t('app:simple_tool_tips'),
          status: 'warning'
        });
        return;
      }

      const tool = {
        ...toolTemplate,
        id: toolTemplate.pluginId!
      };
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

  /* ===== Skill option ===== */
  const skillOption = useMemo<SkillOptionItemType>(() => {
    return {
      onSelect: async (id: string) => {
        if (id === 'systemTool') {
          const data = await onLoadSystemTool({});
          return {
            list: data,
            onClick: onAddAppOrTool
          };
        } else if (id === 'myTools') {
          return {
            description: t('app:space_to_expand_folder'),
            list: myTools,
            onFolderLoad: (folderId: string) => onFolderLoadTeamApps(folderId, ToolTypeList),
            onClick: onAddAppOrTool
          };
        } else if (id === 'agent') {
          return {
            description: t('app:space_to_expand_folder'),
            list: myAgents,
            onFolderLoad: (folderId: string) => onFolderLoadTeamApps(folderId, AppTypeList),
            onClick: onAddAppOrTool
          };
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
      ]
    };
  }, [onAddAppOrTool, onLoadSystemTool, myTools, myAgents, onFolderLoadTeamApps, t]);

  /* ===== Selected skills ===== */
  const selectedSkills = useMemoEnhance<SkillLabelItemType[]>(() => {
    const tools = selectedTools.map((tool) => {
      const configStatus: SkillLabelItemType['configStatus'] = (() => {
        if (tool.pluginData?.error) {
          return 'invalid';
        }
        if (tool.pluginId === SubAppIds.datasetSearch) {
          return hasSelectedDataset ? 'configured' : 'invalid';
        }
        return tool.configStatus || 'waitingForConfig';
      })();

      return {
        ...tool,
        id: tool.pluginId!,
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
        configStatus: hasSelectedDataset ? 'configured' : 'invalid'
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

    return tools;
  }, [selectedTools, canUploadFile, hasSelectedDataset, useAgentSandbox, i18n.language]);

  const [configTool, setConfigTool] = useState<SelectedToolItemType>();
  const onClickSkill = useCallback(
    (id: string) => {
      const tool = selectedTools.find((tool) => tool.pluginId === id);
      if (!tool) return;

      if (isSubApp(tool.flowNodeType)) {
        const hasFormInput = checkNeedsUserConfiguration(tool);
        if (!hasFormInput) {
          return;
        }

        setConfigTool(tool);
      }
    },
    [selectedTools]
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
