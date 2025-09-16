import { useCallback, useMemo, useEffect, useState } from 'react';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useTranslation } from 'next-i18next';
import { useToast } from '@fastgpt/web/hooks/useToast';
import {
  getSystemPlugTemplates,
  getPluginGroups,
  getPreviewPluginNode
} from '@/web/core/app/api/plugin';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { EditorSkillPickerType } from '@fastgpt/web/components/common/Textarea/PromptEditor/plugins/SkillPickerPlugin/type';
import type {
  FlowNodeTemplateType,
  NodeTemplateListItemType
} from '@fastgpt/global/core/workflow/type/node';
import type { localeType } from '@fastgpt/global/common/i18n/type';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { workflowStartNodeId } from '@/web/core/app/constants';
import type { AppFormEditFormType } from '@fastgpt/global/core/app/type';
import type { SystemToolGroupSchemaType } from '@fastgpt/service/core/app/plugin/type';

export type ExtendedToolType = FlowNodeTemplateType & {
  isUnconfigured?: boolean;
};

type UseToolManagerProps = {
  appId?: string;
  appForm: AppFormEditFormType;
  setAppForm: React.Dispatch<React.SetStateAction<AppFormEditFormType>>;
  setConfigTool: (tool: ExtendedToolType | undefined) => void;
  selectedSkillKey?: string;
};

type UseToolManagerReturn = {
  toolSkills: EditorSkillPickerType[];
  queryString: string | null;
  setQueryString: (value: string | null) => void;

  handleAddToolFromEditor: (toolKey: string) => Promise<string>;
  handleConfigureTool: (toolId: string) => void;
  handleRemoveToolFromEditor: (toolId: string) => void;
  onAddTool: (tool: FlowNodeTemplateType) => void;
};

export const useToolManager = ({
  appId,
  appForm,
  setAppForm,
  setConfigTool,
  selectedSkillKey
}: UseToolManagerProps): UseToolManagerReturn => {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const lang = i18n?.language as localeType;
  const [toolSkills, setToolSkills] = useState<EditorSkillPickerType[]>([]);
  const [queryString, setQueryString] = useState<string | null>(null);

  const { data: pluginGroups = [] } = useRequest2(
    async () => {
      try {
        return await getPluginGroups();
      } catch (error) {
        console.error('Failed to load plugin groups:', error);
        return [];
      }
    },
    {
      manual: false,
      onSuccess(data) {
        setToolSkills(
          data.map((item) => ({
            key: item.groupId,
            label: t(item.groupName),
            icon: item.groupAvatar
          }))
        );
      }
    }
  );
  const requestParentId = useMemo(() => {
    if (queryString?.trim()) {
      return '';
    }
    if (toolSkills.some((skill) => !skill.toolCategories && skill.key === selectedSkillKey)) {
      return '';
    }

    for (const skill of toolSkills) {
      for (const category of skill.toolCategories || []) {
        const tool = category.list.find(
          (item) =>
            item.key === selectedSkillKey &&
            item.subItems?.some((subItem) => subItem.key === 'loading')
        );
        if (tool) {
          return selectedSkillKey;
        }
      }
    }

    return null;
  }, [toolSkills, selectedSkillKey, queryString]);
  const buildToolSkills = useCallback(
    (systemPlugins: NodeTemplateListItemType[], pluginGroups: SystemToolGroupSchemaType[]) => {
      return pluginGroups.map((group) => {
        const categoryMap = group.groupTypes.reduce<
          Record<
            string,
            {
              list: Array<{
                key: string;
                name: string;
                avatar: string;
                canOpen?: boolean;
                subItems?: { key: string; label: string }[];
              }>;
              label: string;
            }
          >
        >((acc, item) => {
          acc[item.typeId] = {
            list: [],
            label: t(parseI18nString(item.typeName, lang))
          };
          return acc;
        }, {});
        systemPlugins.forEach((plugin) => {
          if (categoryMap[plugin.templateType]) {
            const canOpen = plugin.flowNodeType === 'toolSet' || plugin.isFolder;
            const subItems = canOpen ? [{ key: 'loading', label: 'Loading... ' }] : undefined;

            categoryMap[plugin.templateType].list.push({
              key: plugin.id,
              name: t(parseI18nString(plugin.name, lang)),
              avatar: plugin.avatar || 'core/workflow/template/toolCall',
              canOpen,
              subItems
            });
          }
        });
        return {
          key: group.groupId,
          label: t(group.groupName as any),
          icon: group.groupAvatar,
          toolCategories: Object.entries(categoryMap)
            .map(([type, { list, label }]) => ({
              type,
              label,
              list
            }))
            .filter((item) => item.list.length > 0)
        };
      });
    },
    [t, lang]
  );

  useRequest2(
    async () => {
      try {
        return await getSystemPlugTemplates({
          parentId: requestParentId || '',
          searchKey: queryString?.trim() || ''
        });
      } catch (error) {
        console.error('Failed to load system plugin templates:', error);
        return [];
      }
    },
    {
      manual: requestParentId === null,
      refreshDeps: [appId, requestParentId, queryString],
      onSuccess(data) {
        if (queryString?.trim()) {
          const searchResults = data.map((plugin) => ({
            key: plugin.id,
            label: t(parseI18nString(plugin.name, lang)),
            icon: plugin.avatar || 'core/workflow/template/toolCall'
          }));

          setToolSkills(searchResults.length > 0 ? searchResults : []);
        } else if (requestParentId === '') {
          const newToolSkills = buildToolSkills(data, pluginGroups);
          setToolSkills(newToolSkills);
        } else if (requestParentId === selectedSkillKey) {
          setToolSkills((prevSkills) => {
            return prevSkills.map((skill) => ({
              ...skill,
              toolCategories: skill.toolCategories?.map((category) => ({
                ...category,
                list: category.list.map((toolItem) => {
                  if (toolItem.key === requestParentId) {
                    const subItems = data.map((plugin) => ({
                      key: plugin.id,
                      label: t(parseI18nString(plugin.name, lang)),
                      description: t(parseI18nString(plugin.intro, lang))
                    }));

                    return {
                      ...toolItem,
                      subItems
                    };
                  }
                  return toolItem;
                })
              }))
            }));
          });
        }
      }
    }
  );

  const validateToolConfiguration = useCallback(
    (toolTemplate: FlowNodeTemplateType): boolean => {
      // 检查文件上传配置
      const oneFileInput =
        toolTemplate.inputs.filter((input) =>
          input.renderTypeList.includes(FlowNodeInputTypeEnum.fileSelect)
        ).length === 1;

      const canUploadFile =
        appForm.chatConfig?.fileSelectConfig?.canSelectFile ||
        appForm.chatConfig?.fileSelectConfig?.canSelectImg;

      const hasValidFileInput = oneFileInput && !!canUploadFile;

      // 检查是否有无效的输入配置
      const hasInvalidInput = toolTemplate.inputs.some(
        (input) =>
          // 引用类型但没有工具描述
          (input.renderTypeList.length === 1 &&
            input.renderTypeList[0] === FlowNodeInputTypeEnum.reference &&
            !input.toolDescription) ||
          // 包含数据集选择
          input.renderTypeList.includes(FlowNodeInputTypeEnum.selectDataset) ||
          // 包含动态输入参数
          input.renderTypeList.includes(FlowNodeInputTypeEnum.addInputParam) ||
          // 文件选择但配置无效
          (input.renderTypeList.includes(FlowNodeInputTypeEnum.fileSelect) && !hasValidFileInput)
      );

      if (hasInvalidInput) {
        toast({
          title: t('app:simple_tool_tips'),
          status: 'warning'
        });
        return false;
      }

      return true;
    },
    [appForm.chatConfig, toast, t]
  );
  // 检查工具是否需要用户配置
  const checkNeedsUserConfiguration = useCallback((toolTemplate: FlowNodeTemplateType): boolean => {
    const formRenderTypes = [
      FlowNodeInputTypeEnum.input,
      FlowNodeInputTypeEnum.textarea,
      FlowNodeInputTypeEnum.numberInput,
      FlowNodeInputTypeEnum.switch,
      FlowNodeInputTypeEnum.select,
      FlowNodeInputTypeEnum.JSONEditor
    ];

    return (
      toolTemplate.inputs.length > 0 &&
      toolTemplate.inputs.some((input) => {
        // 有工具描述的不需要配置
        if (input.toolDescription) return false;
        // 禁用流的不需要配置
        if (input.key === NodeInputKeyEnum.forbidStream) return false;
        // 系统输入配置需要配置
        if (input.key === NodeInputKeyEnum.systemInputConfig) return true;

        // 检查是否包含表单类型的输入
        return formRenderTypes.some((type) => input.renderTypeList.includes(type));
      })
    );
  }, []);

  const handleAddToolFromEditor = useCallback(
    async (toolKey: string): Promise<string> => {
      try {
        // 生成唯一的工具ID
        const toolId = `tool_${getNanoid(6)}`;

        const toolTemplate = await getPreviewPluginNode({ appId: toolKey });

        if (!validateToolConfiguration(toolTemplate)) {
          return '';
        }

        // 检查是否需要用户配置
        const needsConfiguration = checkNeedsUserConfiguration(toolTemplate);

        // 构建工具实例
        const toolInstance: ExtendedToolType = {
          ...toolTemplate,
          id: toolId,
          inputs: toolTemplate.inputs.map((input) => {
            // 文件上传类型设置默认值（从工作流开始节点获取）
            if (input.renderTypeList.includes(FlowNodeInputTypeEnum.fileSelect)) {
              return {
                ...input,
                value: [[workflowStartNodeId, NodeOutputKeyEnum.userFiles]]
              };
            }
            return input;
          }),
          isUnconfigured: needsConfiguration
        };

        // 添加到应用表单
        setAppForm((state: any) => ({
          ...state,
          selectedTools: [...state.selectedTools, toolInstance]
        }));

        return toolId;
      } catch (error) {
        console.error('Failed to add tool from editor:', error);
        // 发生错误时也返回空字符串，避免抛出错误
        return '';
      }
    },
    [validateToolConfiguration, checkNeedsUserConfiguration, setAppForm]
  );

  const handleRemoveToolFromEditor = useCallback(
    (toolId: string) => {
      setAppForm((state: any) => ({
        ...state,
        selectedTools: state.selectedTools.filter((tool: ExtendedToolType) => tool.id !== toolId)
      }));
    },
    [setAppForm]
  );

  const handleConfigureTool = useCallback(
    (toolId: string) => {
      const tool = appForm.selectedTools.find(
        (tool: ExtendedToolType) => tool.id === toolId
      ) as ExtendedToolType;

      if (tool?.isUnconfigured) {
        setConfigTool(tool);
      }
    },
    [appForm.selectedTools, setConfigTool]
  );
  const onAddTool = useCallback(
    (tool: FlowNodeTemplateType) => {
      setAppForm((state: any) => ({
        ...state,
        selectedTools: state.selectedTools.map((t: ExtendedToolType) =>
          t.id === tool.id ? { ...tool, isUnconfigured: false } : t
        )
      }));
      setConfigTool(undefined);
    },
    [setAppForm, setConfigTool]
  );

  return {
    toolSkills,
    queryString,
    setQueryString,

    handleAddToolFromEditor,
    handleConfigureTool,
    handleRemoveToolFromEditor,
    onAddTool
  };
};
