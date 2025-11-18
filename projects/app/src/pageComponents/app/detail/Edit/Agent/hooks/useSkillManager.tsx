import type { ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import type {
  SkillOptionItemType,
  SkillItemType
} from '@fastgpt/web/components/common/Textarea/PromptEditor/plugins/SkillPickerPlugin';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useTranslation } from 'next-i18next';
import { useCallback, useMemo, useState } from 'react';
import { checkNeedsUserConfiguration, validateToolConfiguration } from './utils';
import { useToast } from '@fastgpt/web/hooks/useToast';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { workflowStartNodeId } from '@/web/core/app/constants';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import type { SkillLabelItemType } from '@fastgpt/web/components/common/Textarea/PromptEditor/plugins/SkillLabelPlugin';
import dynamic from 'next/dynamic';
import type { AppFormEditFormType } from '@fastgpt/global/core/app/type';
import {
  getAppToolTemplates,
  getToolPreviewNode,
  getTeamAppTemplates
} from '@/web/core/app/api/tool';
import { AppTypeEnum, AppTypeList, ToolTypeList } from '@fastgpt/global/core/app/constants';

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

type SelectedToolItemType = AppFormEditFormType['selectedTools'][number];

export const useSkillManager = ({
  selectedTools,
  setSelectedTools,
  canSelectFile,
  canSelectImg
}: {
  selectedTools: SelectedToolItemType[];
  setSelectedTools: (tools: SelectedToolItemType[]) => void;
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
      return data.map<SkillItemType>((item) => {
        return {
          id: item.id,
          parentId: item.parentId,
          label: item.name,
          icon: item.avatar,
          showArrow: item.isFolder
        };
      });
    },
    {
      manual: false
    }
  );
  const onLoadSystemTool = useCallback(
    async ({ parentId = null }: { parentId?: ParentIdType; searchKey?: string }) => {
      return systemTools.filter((tool) => {
        return tool.parentId === parentId;
      });
    },
    [systemTools]
  );

  /* ===== Team Apps ===== */
  const { data: allTeamApps = [] } = useRequest2(
    async () => {
      return await getTeamAppTemplates({ parentId: null });
    },
    {
      manual: false
    }
  );
  const myTools = useMemo(
    () =>
      allTeamApps
        .filter((item) => [AppTypeEnum.toolFolder, ...ToolTypeList].includes(item.appType))
        .map((item) => ({
          id: item.id,
          label: item.name,
          icon: item.avatar,
          canOpen: item.isFolder ?? false,
          canUse: item.appType !== AppTypeEnum.folder && item.appType !== AppTypeEnum.toolFolder
        })),
    [allTeamApps]
  );
  const agentApps = useMemo(
    () =>
      allTeamApps
        .filter((item) => [AppTypeEnum.folder, ...AppTypeList].includes(item.appType))
        .map((item) => ({
          id: item.id,
          label: item.name,
          icon: item.avatar,
          canOpen: item.isFolder ?? false,
          canUse: item.appType !== AppTypeEnum.folder && item.appType !== AppTypeEnum.toolFolder
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
        canOpen: item.isFolder ?? false,
        canUse: item.appType !== AppTypeEnum.folder && item.appType !== AppTypeEnum.toolFolder
      };
    });
  }, []);

  /* ===== Workflow tool ===== */
  const { runAsync: onAddAppOrTool } = useRequest2(
    async (appId: string) => {
      const toolTemplate = await getToolPreviewNode({ appId });
      const checkRes = validateToolConfiguration({
        toolTemplate,
        canSelectFile,
        canSelectImg
      });
      if (!checkRes) {
        toast({
          title: t('app:simple_tool_tips'),
          status: 'warning'
        });
        return;
      }

      const tool: SelectedToolItemType = {
        ...toolTemplate,
        id: `tool_${getNanoid(6)}`,
        inputs: toolTemplate.inputs.map((input) => {
          // 如果是文件上传类型,设置为从工作流开始节点获取用户文件
          if (input.renderTypeList.includes(FlowNodeInputTypeEnum.fileSelect)) {
            return {
              ...input,
              value: [[workflowStartNodeId, NodeOutputKeyEnum.userFiles]]
            };
          }
          return input;
        })
      };
      const hasFormInput = checkNeedsUserConfiguration(tool);

      setSelectedTools([
        ...selectedTools,
        {
          ...tool,
          configStatus: hasFormInput ? 'waitingForConfig' : 'active'
        }
      ]);

      return tool.id;
    },
    { manual: true }
  );

  /* ===== Skill option ===== */
  const skillOption = useMemo<SkillOptionItemType>(() => {
    return {
      onSelect: async (id: string) => {
        if (id === 'systemTool') {
          const data = await onLoadSystemTool({ parentId: null });
          return {
            description: t('app:can_select_toolset'),
            list: data,
            onSelect: async (id: string) => {
              const data = await onLoadSystemTool({ parentId: id });
              return {
                onClick: onAddAppOrTool,
                list: data.map((item) => ({
                  id: item.id,
                  label: item.label
                }))
              };
            },
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
            list: agentApps,
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
          icon: 'core/workflow/template/toolCall'
        },
        {
          id: 'myTools',
          label: t('common:navbar.Tools'),
          icon: 'core/app/type/pluginFill'
        },
        {
          id: 'agent',
          label: 'Agent',
          icon: 'core/workflow/template/runApp'
        }
      ]
    };
  }, [onAddAppOrTool, onLoadSystemTool, myTools, agentApps, onFolderLoadTeamApps, t]);

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
      setSelectedTools(selectedTools.filter((tool) => tool.id !== id));
    },
    [selectedTools, setSelectedTools]
  );

  const SkillModal = useCallback(() => {
    return (
      <>
        {!!configTool && (
          <ConfigToolModal
            configTool={configTool}
            onCloseConfigTool={() => setConfigTool(undefined)}
            onAddTool={(tool) =>
              setSelectedTools(
                selectedTools.map((t) =>
                  t.id === tool.id
                    ? {
                        ...tool,
                        configStatus: 'active'
                      }
                    : t
                )
              )
            }
          />
        )}
      </>
    );
  }, [configTool, selectedTools, setSelectedTools]);

  return {
    skillOption,
    selectedSkills,
    onClickSkill,
    onRemoveSkill,
    SkillModal
  };
};
