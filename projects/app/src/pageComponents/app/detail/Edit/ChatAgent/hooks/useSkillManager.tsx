import type {
  SkillOptionItemType,
  SkillItemType
} from '@fastgpt/web/components/common/Textarea/PromptEditor/plugins/SkillPickerPlugin';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useTranslation } from 'next-i18next';
import { useCallback, useMemo, useState } from 'react';
import {
  checkNeedsUserConfiguration,
  getToolConfigStatus,
  validateToolConfiguration
} from '@fastgpt/global/core/app/formEdit/utils';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import type { SkillLabelItemType } from '@fastgpt/web/components/common/Textarea/PromptEditor/plugins/SkillLabelPlugin';
import dynamic from 'next/dynamic';
import type { SelectedToolItemType } from '@fastgpt/global/core/app/formEdit/type';
import {
  getAppToolTemplates,
  getToolPreviewNode,
  getTeamAppTemplates
} from '@/web/core/app/api/tool';
import {
  AppFolderTypeList,
  AppTypeEnum,
  AppTypeList,
  ToolTypeList
} from '@fastgpt/global/core/app/constants';

const ConfigToolModal = dynamic(() => import('../../component/ConfigToolModal'));

const isSubApp = (flowNodeType: FlowNodeTypeEnum) => {
  const subAppTypeMap: Record<string, boolean> = {
    [FlowNodeTypeEnum.toolSet]: true,
    [FlowNodeTypeEnum.tool]: true,
    [FlowNodeTypeEnum.appModule]: true,
    [FlowNodeTypeEnum.pluginModule]: true
  };
  return !!subAppTypeMap[flowNodeType];
};

export const useSkillManager = ({
  topAgentSelectedTools,
  selectedTools,
  onUpdateOrAddTool,
  onDeleteTool,
  canSelectFile,
  canSelectImg
}: {
  topAgentSelectedTools: SelectedToolItemType[];
  selectedTools: SelectedToolItemType[];
  onDeleteTool: (id: string) => void;
  onUpdateOrAddTool: (tool: SelectedToolItemType) => void;
  canSelectFile?: boolean;
  canSelectImg?: boolean;
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();

  /* ===== System tool ===== */
  const { data: systemTools = [] } = useRequest2(
    async () => {
      const data = await getAppToolTemplates({ getAll: true }).catch((err) => {
        return [];
      });
      return data
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
  const { data: allTeamApps = [] } = useRequest2(() => getTeamAppTemplates({ parentId: null }), {
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

  const onAddAppOrTool = useCallback(
    async (toolId: string) => {
      // Check tool exists, if exists, not update/add tool
      const existsTool = selectedTools.find((tool) => tool.pluginId === toolId);
      if (existsTool) {
        return existsTool.id;
      }

      const toolTemplate = await getToolPreviewNode({ appId: toolId });

      const toolValid = validateToolConfiguration({
        toolTemplate,
        canSelectFile,
        canSelectImg
      });
      if (!toolValid) {
        toast({
          title: t('app:simple_tool_tips'),
          status: 'warning'
        });
        return;
      }

      // 添加与 top 相同工具的配置
      const topTool = topAgentSelectedTools.find((tool) => tool.pluginId === toolTemplate.pluginId);
      if (topTool) {
        toolTemplate.inputs.forEach((input) => {
          const topInput = topTool.inputs.find((tInput) => tInput.key === input.key);
          if (topInput) {
            input.value = topInput.value;
          }
        });
      }

      const tool: SelectedToolItemType = {
        ...toolTemplate,
        id: toolId
      };

      onUpdateOrAddTool({
        ...tool,
        configStatus: getToolConfigStatus(tool).status
      });

      return tool.id;
    },
    [canSelectFile, canSelectImg, onUpdateOrAddTool, selectedTools, t, toast, topAgentSelectedTools]
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
    return selectedTools.map((tool) => {
      const configStatus: SkillLabelItemType['configStatus'] = (() => {
        if (isSubApp(tool.flowNodeType)) {
          if (tool.pluginData?.error) {
            return 'invalid';
          }
        }
        return tool.configStatus || 'active';
      })();
      return {
        ...tool,
        configStatus
      };
    });
  }, [selectedTools]);

  const [configTool, setConfigTool] = useState<SelectedToolItemType>();
  const onClickSkill = useCallback(
    (id: string) => {
      const tool = selectedTools.find((tool) => tool.id === id);
      if (!tool) return;

      if (isSubApp(tool.flowNodeType)) {
        const hasFormInput = checkNeedsUserConfiguration(tool);
        if (!hasFormInput) return;
        setConfigTool(tool);
      } else {
        console.log('onClickSkill', id);
      }
    },
    [selectedTools]
  );
  const onRemoveSkill = useCallback(
    (id: string) => {
      console.log('onRemoveSkill', id);
      onDeleteTool(id);
    },
    [onDeleteTool]
  );

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
                configStatus: 'active'
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
