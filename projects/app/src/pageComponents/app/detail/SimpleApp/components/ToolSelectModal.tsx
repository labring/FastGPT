import React, { useCallback, useMemo, useState } from 'react';

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
import {
  FlowNodeTemplateType,
  NodeTemplateListItemType,
  NodeTemplateListType
} from '@fastgpt/global/core/workflow/type/node.d';
import MyIcon from '@fastgpt/web/components/common/Icon';
import {
  getPluginGroups,
  getPreviewPluginNode,
  getSystemPlugTemplates,
  getSystemPluginPaths
} from '@/web/core/app/api/plugin';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { getTeamPlugTemplates } from '@/web/core/app/api/plugin';
import { ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import { getAppFolderPath } from '@/web/core/app/api/app';
import FolderPath from '@/components/common/folder/Path';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import CostTooltip from '@/components/core/app/plugin/CostTooltip';
import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { useContextSelector } from 'use-context-selector';
import { AppContext } from '../../context';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';
import { useMemoizedFn } from 'ahooks';
import MyAvatar from '@fastgpt/web/components/common/Avatar';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { AppSimpleEditFormType } from '@fastgpt/global/core/app/type';
import { useToast } from '@fastgpt/web/hooks/useToast';
import type { LLMModelItemType } from '@fastgpt/global/core/ai/model.d';
import { workflowStartNodeId } from '@/web/core/app/constants';
import ConfigToolModal from './ConfigToolModal';

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

enum TemplateTypeEnum {
  'systemPlugin' = 'systemPlugin',
  'teamPlugin' = 'teamPlugin'
}

const ToolSelectModal = ({ onClose, ...props }: Props & { onClose: () => void }) => {
  const { t } = useTranslation();
  const { appDetail } = useContextSelector(AppContext, (v) => v);

  const [templateType, setTemplateType] = useState(TemplateTypeEnum.systemPlugin);
  const [parentId, setParentId] = useState<ParentIdType>('');
  const [searchKey, setSearchKey] = useState('');

  const {
    data: templates = [],
    runAsync: loadTemplates,
    loading: isLoading
  } = useRequest2(
    async ({
      type = templateType,
      parentId = '',
      searchVal = searchKey
    }: {
      type?: TemplateTypeEnum;
      parentId?: ParentIdType;
      searchVal?: string;
    }) => {
      if (type === TemplateTypeEnum.systemPlugin) {
        return getSystemPlugTemplates({ parentId, searchKey: searchVal });
      } else if (type === TemplateTypeEnum.teamPlugin) {
        return getTeamPlugTemplates({
          parentId,
          searchKey: searchVal
        }).then((res) => res.filter((app) => app.id !== appDetail._id));
      }
    },
    {
      onSuccess(_, [{ type = templateType, parentId = '' }]) {
        setTemplateType(type);
        setParentId(parentId);
      },
      refreshDeps: [templateType, searchKey, parentId],
      errorToast: t('common:core.module.templates.Load plugin error')
    }
  );

  const { data: paths = [] } = useRequest2(
    () => {
      if (templateType === TemplateTypeEnum.teamPlugin) return getAppFolderPath(parentId);
      return getSystemPluginPaths(parentId);
    },
    {
      manual: false,
      refreshDeps: [parentId]
    }
  );

  const onUpdateParentId = useCallback(
    (parentId: ParentIdType) => {
      loadTemplates({
        parentId
      });
    },
    [loadTemplates]
  );

  useRequest2(() => loadTemplates({ searchVal: searchKey }), {
    manual: false,
    throttleWait: 300,
    refreshDeps: [searchKey]
  });

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
      {/* Header: row and search */}
      <Box px={[3, 6]} pt={4} display={'flex'} justifyContent={'space-between'} w={'full'}>
        <FillRowTabs
          list={[
            {
              icon: 'phoneTabbar/tool',
              label: t('common:navbar.Toolkit'),
              value: TemplateTypeEnum.systemPlugin
            },
            {
              icon: 'core/modules/teamPlugin',
              label: t('common:core.module.template.Team app'),
              value: TemplateTypeEnum.teamPlugin
            }
          ]}
          py={'5px'}
          px={'15px'}
          value={templateType}
          onChange={(e) =>
            loadTemplates({
              type: e as TemplateTypeEnum,
              parentId: null
            })
          }
        />
        <Box w={300}>
          <SearchInput
            value={searchKey}
            onChange={(e) => setSearchKey(e.target.value)}
            placeholder={
              templateType === TemplateTypeEnum.systemPlugin
                ? t('common:plugin.Search plugin')
                : t('app:search_app')
            }
          />
        </Box>
      </Box>
      {/* route components */}
      {!searchKey && parentId && (
        <Flex mt={2} px={[3, 6]}>
          <FolderPath paths={paths} FirstPathDom={null} onClick={() => onUpdateParentId(null)} />
        </Flex>
      )}
      <MyBox isLoading={isLoading} mt={2} px={[3, 6]} pb={3} flex={'1 0 0'} overflowY={'auto'}>
        <RenderList
          templates={templates}
          type={templateType}
          setParentId={onUpdateParentId}
          {...props}
        />
      </MyBox>
    </MyModal>
  );
};

export default React.memo(ToolSelectModal);

const RenderList = React.memo(function RenderList({
  templates,
  type,
  onAddTool,
  onRemoveTool,
  setParentId,
  selectedTools,
  chatConfig,
  selectedModel
}: Props & {
  templates: NodeTemplateListItemType[];
  type: TemplateTypeEnum;
  setParentId: (parentId: ParentIdType) => any;
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
          // 如果是模型选择类型,使用当前选中的模型
          // if (input.renderTypeList.includes(FlowNodeInputTypeEnum.selectLLMModel)) {
          //   return {
          //     ...input,
          //     value: selectedModel.model
          //   };
          // }
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

  const { data: pluginGroups = [] } = useRequest2(getPluginGroups, {
    manual: false
  });

  const formatTemplatesArray = useMemo(() => {
    const data = (() => {
      if (type === TemplateTypeEnum.systemPlugin) {
        return pluginGroups.map((group) => {
          const copy: NodeTemplateListType = group.groupTypes.map((type) => ({
            list: [],
            type: type.typeId,
            label: type.typeName
          }));
          templates.forEach((item) => {
            const index = copy.findIndex((template) => template.type === item.templateType);
            if (index === -1) return;
            copy[index].list.push(item);
          });
          return {
            label: group.groupName,
            list: copy.filter((item) => item.list.length > 0)
          };
        });
      }

      return [
        {
          list: [
            {
              list: templates,
              type: '',
              label: ''
            }
          ],
          label: ''
        }
      ];
    })();

    return data.filter(({ list }) => list.length > 0);
  }, [pluginGroups, templates, type]);

  const gridStyle = useMemo(() => {
    if (type === TemplateTypeEnum.teamPlugin) {
      return {
        gridTemplateColumns: ['1fr', '1fr'],
        py: 2,
        avatarSize: '2rem'
      };
    }

    return {
      gridTemplateColumns: ['1fr', '1fr 1fr'],
      py: 3,
      avatarSize: '1.75rem'
    };
  }, [type]);

  const PluginListRender = useMemoizedFn(({ list = [] }: { list: NodeTemplateListType }) => {
    return (
      <>
        {list.map((item, i) => {
          return (
            <Box
              key={item.type}
              css={css({
                span: {
                  display: 'block'
                }
              })}
            >
              <Flex>
                <Box fontSize={'sm'} my={2} fontWeight={'500'} flex={1} color={'myGray.900'}>
                  {t(item.label as any)}
                </Box>
              </Flex>
              <Grid gridTemplateColumns={gridStyle.gridTemplateColumns} rowGap={2} columnGap={3}>
                {item.list.map((template) => {
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
                          {type === TemplateTypeEnum.systemPlugin && (
                            <CostTooltip
                              cost={template.currentCost}
                              hasTokenFee={template.hasTokenFee}
                            />
                          )}
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
                            {t('common:common.Remove')}
                          </Button>
                        ) : template.isFolder ? (
                          <Button
                            size={'sm'}
                            variant={'whiteBase'}
                            leftIcon={<MyIcon name={'common/arrowRight'} w={'16px'} mr={-1.5} />}
                            onClick={() => setParentId(template.id)}
                            px={2}
                            fontSize={'mini'}
                          >
                            {t('common:common.Open')}
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
                            {t('common:common.Add')}
                          </Button>
                        )}
                      </Flex>
                    </MyTooltip>
                  );
                })}
              </Grid>
            </Box>
          );
        })}
      </>
    );
  });

  return templates.length === 0 ? (
    <EmptyTip text={t('app:module.No Modules')} />
  ) : (
    <Box flex={'1 0 0'} overflow={'overlay'}>
      <Accordion defaultIndex={[0]} allowMultiple reduceMotion>
        {formatTemplatesArray.length > 1 ? (
          <>
            {formatTemplatesArray.map(({ list, label }, index) => (
              <AccordionItem key={index} border={'none'}>
                <AccordionButton
                  fontSize={'sm'}
                  fontWeight={'500'}
                  color={'myGray.900'}
                  justifyContent={'space-between'}
                  alignItems={'center'}
                  borderRadius={'md'}
                  px={3}
                >
                  {t(label as any)}
                  <AccordionIcon />
                </AccordionButton>
                <AccordionPanel py={0}>
                  <PluginListRender list={list} />
                </AccordionPanel>
              </AccordionItem>
            ))}
          </>
        ) : (
          <PluginListRender list={formatTemplatesArray?.[0]?.list} />
        )}
      </Accordion>

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
