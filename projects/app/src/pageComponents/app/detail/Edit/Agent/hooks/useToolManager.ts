import { useCallback, useMemo, useState } from 'react';
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
import type { SkillOptionType } from '@fastgpt/web/components/common/Textarea/PromptEditor/plugins/SkillPickerPlugin';
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
  appForm: AppFormEditFormType;
  setAppForm: React.Dispatch<React.SetStateAction<AppFormEditFormType>>;
  setConfigTool: (tool: ExtendedToolType | undefined) => void;
  selectedSkillKey?: string;
};

type UseToolManagerReturn = {
  toolSkillOptions: SkillOptionType[];
  queryString: string | null;
  setQueryString: (value: string | null) => void;

  handleAddToolFromEditor: (toolKey: string) => Promise<string>;
  handleConfigureTool: (toolId: string) => void;
  handleRemoveToolFromEditor: (toolId: string) => void;
};

export const useToolManager = ({
  appForm,
  setAppForm,
  setConfigTool,
  selectedSkillKey
}: UseToolManagerProps): UseToolManagerReturn => {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const lang = i18n?.language as localeType;
  const [toolSkillOptions, setToolSkillOptions] = useState<SkillOptionType[]>([]);
  const [queryString, setQueryString] = useState<string | null>(null);

  /* get tool skills */
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
        const primaryOptions: SkillOptionType[] = data.map((item) => ({
          key: item.groupId,
          label: t(item.groupName),
          icon: 'core/workflow/template/toolCall'
        }));
        setToolSkillOptions(primaryOptions);
      }
    }
  );
  const requestParentId = useMemo(() => {
    if (queryString?.trim()) {
      return '';
    }
    const selectedOption = toolSkillOptions.find((option) => option.key === selectedSkillKey);
    if (!toolSkillOptions.some((option) => option.parentKey) && selectedOption) {
      return '';
    }
    if (selectedOption?.canOpen) {
      const hasLoadingPlaceholder = toolSkillOptions.some(
        (option) => option.parentKey === selectedSkillKey && option.key === 'loading'
      );
      if (hasLoadingPlaceholder) {
        return selectedSkillKey;
      }
    }

    return null;
  }, [toolSkillOptions, selectedSkillKey, queryString]);
  const buildToolSkillOptions = useCallback(
    (systemPlugins: NodeTemplateListItemType[], pluginGroups: SystemToolGroupSchemaType[]) => {
      const skillOptions: SkillOptionType[] = [];

      pluginGroups.forEach((group) => {
        skillOptions.push({
          key: group.groupId,
          label: t(group.groupName as any),
          icon: 'core/workflow/template/toolCall'
        });
      });

      pluginGroups.forEach((group) => {
        const categoryMap = group.groupTypes.reduce<
          Record<string, { label: string; type: string }>
        >((acc, item) => {
          acc[item.typeId] = {
            label: t(parseI18nString(item.typeName, lang)),
            type: item.typeId
          };
          return acc;
        }, {});

        const pluginsByCategory = new Map<string, NodeTemplateListItemType[]>();
        systemPlugins.forEach((plugin) => {
          if (categoryMap[plugin.templateType]) {
            if (!pluginsByCategory.has(plugin.templateType)) {
              pluginsByCategory.set(plugin.templateType, []);
            }
            pluginsByCategory.get(plugin.templateType)!.push(plugin);
          }
        });

        pluginsByCategory.forEach((plugins, categoryType) => {
          plugins.forEach((plugin) => {
            const canOpen = plugin.flowNodeType === 'toolSet' || plugin.isFolder;
            const category = categoryMap[categoryType];

            skillOptions.push({
              key: plugin.id,
              label: t(parseI18nString(plugin.name, lang)),
              icon: plugin.avatar || 'core/workflow/template/toolCall',
              parentKey: group.groupId,
              canOpen,
              categoryType: category.type,
              categoryLabel: category.label
            });

            if (canOpen) {
              skillOptions.push({
                key: 'loading',
                label: 'Loading...',
                icon: plugin.avatar || 'core/workflow/template/toolCall',
                parentKey: plugin.id
              });
            }
          });
        });
      });

      return skillOptions;
    },
    [t, lang]
  );
  const buildSearchOptions = useCallback(
    (searchResults: NodeTemplateListItemType[]) => {
      return searchResults.map((plugin) => ({
        key: plugin.id,
        label: t(parseI18nString(plugin.name, lang)),
        icon: plugin.avatar || 'core/workflow/template/toolCall'
      }));
    },
    [t, lang]
  );
  const updateTertiaryOptions = useCallback(
    (
      currentOptions: SkillOptionType[],
      parentKey: string | undefined,
      subItems: NodeTemplateListItemType[]
    ) => {
      const filteredOptions = currentOptions.filter((option) => !(option.parentKey === parentKey));

      const newTertiaryOptions = subItems.map((plugin) => ({
        key: plugin.id,
        label: t(parseI18nString(plugin.name, lang)),
        icon: 'core/workflow/template/toolCall',
        parentKey
      }));

      return [...filteredOptions, ...newTertiaryOptions];
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
      refreshDeps: [requestParentId, queryString],
      onSuccess(data) {
        if (queryString?.trim()) {
          const searchOptions = buildSearchOptions(data);
          setToolSkillOptions(searchOptions);
        } else if (requestParentId === '') {
          const fullOptions = buildToolSkillOptions(data, pluginGroups);
          setToolSkillOptions(fullOptions);
        } else if (requestParentId === selectedSkillKey) {
          setToolSkillOptions((prevOptions) =>
            updateTertiaryOptions(prevOptions, requestParentId, data)
          );
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
        const toolTemplate = await getPreviewPluginNode({ appId: toolKey });
        if (!validateToolConfiguration(toolTemplate)) {
          return '';
        }

        const needsConfiguration = checkNeedsUserConfiguration(toolTemplate);
        const toolId = `tool_${getNanoid(6)}`;
        const toolInstance: ExtendedToolType = {
          ...toolTemplate,
          id: toolId,
          inputs: toolTemplate.inputs.map((input) => {
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

        setAppForm((state: any) => ({
          ...state,
          selectedTools: [...state.selectedTools, toolInstance]
        }));

        return toolId;
      } catch (error) {
        console.error('Failed to add tool from editor:', error);
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

  return {
    toolSkillOptions,
    queryString,
    setQueryString,

    handleAddToolFromEditor,
    handleConfigureTool,
    handleRemoveToolFromEditor
  };
};
