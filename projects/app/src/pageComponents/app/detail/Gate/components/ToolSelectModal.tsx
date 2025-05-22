import React, { useCallback, useMemo, useState, useEffect } from 'react';

import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import {
  Accordion,
  AccordionButton,
  AccordionIcon,
  AccordionItem,
  AccordionPanel,
  Box,
  Button,
  css,
  Flex,
  Grid
} from '@chakra-ui/react';
import FillRowTabs from '@fastgpt/web/components/common/Tabs/FillRowTabs';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import type {
  FlowNodeTemplateType,
  NodeTemplateListItemType,
  NodeTemplateListType
} from '@fastgpt/global/core/workflow/type/node.d';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { getPluginGroups, getPreviewPluginNode, getBatchPlugins } from '@/web/core/app/api/plugin';
import MyBox from '@fastgpt/web/components/common/MyBox';
import type { ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import CostTooltip from '@/components/core/app/plugin/CostTooltip';
import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { useContextSelector } from 'use-context-selector';
import { AppContext } from '../../context';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';
import { useMemoizedFn } from 'ahooks';
import MyAvatar from '@fastgpt/web/components/common/Avatar';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { AppSimpleEditFormType } from '@fastgpt/global/core/app/type';
import { useToast } from '@fastgpt/web/hooks/useToast';
import type { LLMModelItemType } from '@fastgpt/global/core/ai/model.d';
import { workflowStartNodeId } from '@/web/core/app/constants';
import ConfigToolModal from './ConfigToolModal';
import { getTeamGateConfig } from '@/web/support/user/team/gate/api';
import type { GateSchemaType } from '@fastgpt/global/support/user/team/gate/type';

type Props = {
  selectedTools: FlowNodeTemplateType[];
  chatConfig: AppSimpleEditFormType['chatConfig'];
  selectedModel: LLMModelItemType;
  onAddTool: (tool: FlowNodeTemplateType) => void;
  onRemoveTool: (tool: NodeTemplateListItemType) => void;
};

export const childAppSystemKey: string[] = [
  NodeInputKeyEnum.forbidStream,
  NodeInputKeyEnum.history,
  NodeInputKeyEnum.historyMaxAmount,
  NodeInputKeyEnum.userChatInput
];

const ToolSelectModal = ({ onClose, ...props }: Props & { onClose: () => void }) => {
  const { t } = useTranslation();
  const { appDetail } = useContextSelector(AppContext, (v) => v);

  const [searchKey, setSearchKey] = useState('');
  const [gateConfig, setGateConfig] = useState<GateSchemaType | undefined>(undefined);
  // 加载 gateConfig
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const config = await getTeamGateConfig();
        setGateConfig(config);
      } catch (error) {
        console.error('Failed to load gate config:', error);
      }
    };
    loadConfig();
  }, []);
  const [gatePlugins, setGatePlugins] = useState<NodeTemplateListItemType[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // 加载 gateStore 中的插件
  useEffect(() => {
    if (gateConfig?.tools && gateConfig.tools.length > 0) {
      setIsLoading(true);
      getBatchPlugins(gateConfig.tools)
        .then((plugins) => {
          // 将插件对象转换为数组形式
          const pluginsArray = Object.entries(plugins).map(([id, plugin]) => ({
            id,
            pluginId: id,
            name: plugin.name,
            avatar: plugin.avatar,
            intro: plugin.intro || '',
            isFolder: false,
            templateType: plugin.templateType,
            flowNodeType: plugin.flowNodeType
          }));
          setGatePlugins(pluginsArray);
        })
        .catch((error) => {
          console.error('加载门户工具失败:', error);
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  }, [gateConfig]);

  // 根据搜索关键词过滤插件
  const filteredPlugins = useMemo(() => {
    if (!searchKey) return gatePlugins;
    return gatePlugins.filter(
      (plugin) =>
        plugin.name.toLowerCase().includes(searchKey.toLowerCase()) ||
        (plugin.intro && plugin.intro.toLowerCase().includes(searchKey.toLowerCase()))
    );
  }, [gatePlugins, searchKey]);

  return (
    <MyModal
      isOpen
      title={t('common:core.app.Tool call')}
      iconSrc="core/app/toolCall"
      onClose={onClose}
      maxW={['90vw', '700px']}
      w={'700px'}
      h={['90vh', '80vh']}
    >
      {/* Header: search */}
      <Box px={[3, 6]} pt={4} display={'flex'} justifyContent={'flex-end'} w={'full'}>
        <Box w={300}>
          <SearchInput
            value={searchKey}
            onChange={(e) => setSearchKey(e.target.value)}
            placeholder={t('common:plugin.Search plugin')}
          />
        </Box>
      </Box>

      <MyBox isLoading={isLoading} mt={2} px={[3, 6]} pb={3} flex={'1 0 0'} overflowY={'auto'}>
        <RenderList templates={filteredPlugins} {...props} />
      </MyBox>
    </MyModal>
  );
};

export default React.memo(ToolSelectModal);

const RenderList = React.memo(function RenderList({
  templates,
  onAddTool,
  onRemoveTool,
  selectedTools,
  chatConfig,
  selectedModel
}: Props & {
  templates: NodeTemplateListItemType[];
}) {
  const { t } = useTranslation();
  const [configTool, setConfigTool] = useState<FlowNodeTemplateType>();
  const onCloseConfigTool = useCallback(() => setConfigTool(undefined), []);
  const { toast } = useToast();

  const { runAsync: onClickAdd, loading: isLoading } = useRequest2(
    async (template: NodeTemplateListItemType) => {
      const res = await getPreviewPluginNode({ appId: template.id });

      /* Invalid plugin check
        1. Reference type. but not tool description;
        2. Has dataset select
        3. Has dynamic external data
      */
      const oneFileInput =
        res.inputs.filter((input) =>
          input.renderTypeList.includes(FlowNodeInputTypeEnum.fileSelect)
        ).length === 1;
      const canUploadFile =
        chatConfig?.fileSelectConfig?.canSelectFile || chatConfig?.fileSelectConfig?.canSelectImg;
      const invalidFileInput = oneFileInput && !!canUploadFile;
      if (
        res.inputs.some(
          (input) =>
            (input.renderTypeList.length === 1 &&
              input.renderTypeList[0] === FlowNodeInputTypeEnum.reference &&
              !input.toolDescription) ||
            input.renderTypeList.includes(FlowNodeInputTypeEnum.selectDataset) ||
            input.renderTypeList.includes(FlowNodeInputTypeEnum.addInputParam) ||
            (input.renderTypeList.includes(FlowNodeInputTypeEnum.fileSelect) && !invalidFileInput)
        )
      ) {
        return toast({
          title: t('app:simple_tool_tips'),
          status: 'warning'
        });
      }

      // 判断是否可以直接添加工具,满足以下任一条件:
      // 1. 有工具描述
      // 2. 是模型选择类型
      // 3. 是文件上传类型且:已开启文件上传、非必填、只有一个文件上传输入
      const hasInputForm =
        res.inputs.length > 0 &&
        res.inputs.some((input) => {
          if (input.toolDescription) {
            return false;
          }
          if (input.key === NodeInputKeyEnum.forbidStream) {
            return false;
          }
          if (input.renderTypeList.includes(FlowNodeInputTypeEnum.input)) {
            return true;
          }
          if (input.renderTypeList.includes(FlowNodeInputTypeEnum.textarea)) {
            return true;
          }
          if (input.renderTypeList.includes(FlowNodeInputTypeEnum.numberInput)) {
            return true;
          }
          if (input.renderTypeList.includes(FlowNodeInputTypeEnum.switch)) {
            return true;
          }
          if (input.renderTypeList.includes(FlowNodeInputTypeEnum.select)) {
            return true;
          }
          if (input.renderTypeList.includes(FlowNodeInputTypeEnum.JSONEditor)) {
            return true;
          }
          return false;
        });

      // 构建默认表单数据
      const defaultForm = {
        ...res,
        inputs: res.inputs.map((input) => {
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

      if (hasInputForm) {
        setConfigTool(defaultForm);
      } else {
        onAddTool(defaultForm);
      }
    },
    {
      errorToast: t('common:core.module.templates.Load plugin error')
    }
  );

  const gridStyle = useMemo(() => {
    return {
      gridTemplateColumns: ['1fr', '1fr 1fr'],
      py: 3,
      avatarSize: '1.75rem'
    };
  }, []);

  return templates.length === 0 ? (
    <EmptyTip text={t('app:module.No Modules')} />
  ) : (
    <Box flex={'1 0 0'} overflow={'overlay'}>
      <Grid gridTemplateColumns={gridStyle.gridTemplateColumns} rowGap={2} columnGap={3}>
        {templates.map((template) => {
          const selected = selectedTools.some((tool) => tool.pluginId === template.id);

          return (
            <MyTooltip
              key={template.id}
              placement={'right'}
              label={
                <Box py={2}>
                  <Flex alignItems={'center'}>
                    <MyAvatar
                      src={template.avatar}
                      w={'1.75rem'}
                      objectFit={'contain'}
                      borderRadius={'sm'}
                    />
                    <Box fontWeight={'bold'} ml={3} color={'myGray.900'}>
                      {t(template.name as any)}
                    </Box>
                  </Flex>
                  <Box mt={2} color={'myGray.500'} maxH={'100px'} overflow={'hidden'}>
                    {t(template.intro as any) || t('common:core.workflow.Not intro')}
                  </Box>
                  <CostTooltip cost={template.currentCost} hasTokenFee={template.hasTokenFee} />
                </Box>
              }
            >
              <Flex
                alignItems={'center'}
                py={gridStyle.py}
                px={3}
                _hover={{ bg: 'myWhite.600' }}
                borderRadius={'sm'}
                whiteSpace={'nowrap'}
                overflow={'hidden'}
                textOverflow={'ellipsis'}
              >
                <MyAvatar
                  src={template.avatar}
                  w={gridStyle.avatarSize}
                  objectFit={'contain'}
                  borderRadius={'sm'}
                  flexShrink={0}
                />
                <Box
                  color={'myGray.900'}
                  fontWeight={'500'}
                  fontSize={'sm'}
                  flex={'1 0 0'}
                  ml={3}
                  className="textEllipsis"
                >
                  {t(template.name as any)}
                </Box>

                {selected ? (
                  <Button
                    size={'sm'}
                    variant={'grayDanger'}
                    leftIcon={<MyIcon name={'delete'} w={'16px'} mr={-1} />}
                    onClick={() => onRemoveTool(template)}
                    px={2}
                    fontSize={'mini'}
                  >
                    {t('common:Remove')}
                  </Button>
                ) : (
                  <Button
                    size={'sm'}
                    variant={'primaryOutline'}
                    leftIcon={<MyIcon name={'common/addLight'} w={'16px'} mr={-1.5} />}
                    isLoading={isLoading}
                    onClick={() => onClickAdd(template)}
                    px={2}
                    fontSize={'mini'}
                  >
                    {t('common:Add')}
                  </Button>
                )}
              </Flex>
            </MyTooltip>
          );
        })}
      </Grid>

      {!!configTool && (
        <ConfigToolModal
          configTool={configTool}
          onCloseConfigTool={onCloseConfigTool}
          onAddTool={onAddTool}
        />
      )}
    </Box>
  );
});
