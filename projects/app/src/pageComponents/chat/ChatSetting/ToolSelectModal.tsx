import React, { useCallback, useMemo, useState } from 'react';

import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import { Box, Button, Flex, Grid } from '@chakra-ui/react';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import {
  type FlowNodeTemplateType,
  type NodeTemplateListItemType
} from '@fastgpt/global/core/workflow/type/node.d';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { getToolPreviewNode, getAppToolTemplates, getAppToolPaths } from '@/web/core/app/api/tool';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { type ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import FolderPath from '@/components/common/folder/Path';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';
import { useMemoizedFn } from 'ahooks';
import MyAvatar from '@fastgpt/web/components/common/Avatar';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { type AppSimpleEditFormType } from '@fastgpt/global/core/app/type';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { workflowStartNodeId } from '@/web/core/app/constants';
import ConfigToolModal from '@/pageComponents/app/detail/SimpleApp/components/ConfigToolModal';
import type { ChatSettingType } from '@fastgpt/global/core/chat/setting/type';
import CostTooltip from '@/components/core/app/tool/CostTooltip';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import ToolTagFilterBox from '@fastgpt/web/components/core/plugin/tool/TagFilterBox';
import { getPluginToolTags } from '@/web/core/plugin/toolTag/api';

type Props = {
  selectedTools: ChatSettingType['selectedTools'];
  chatConfig?: AppSimpleEditFormType['chatConfig'];
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
  const [parentId, setParentId] = useState<ParentIdType>('');
  const [searchKey, setSearchKey] = useState('');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

  const {
    data: rawTemplates = [],
    runAsync: loadTemplates,
    loading: isLoading
  } = useRequest2(
    async ({
      parentId = '',
      searchVal = searchKey
    }: {
      parentId?: ParentIdType;
      searchVal?: string;
    }) => {
      return getAppToolTemplates({ parentId, searchKey: searchVal });
    },
    {
      onSuccess(_, [{ parentId = '' }]) {
        setParentId(parentId);
      },
      refreshDeps: [searchKey, parentId],
      errorToast: t('common:core.module.templates.Load plugin error')
    }
  );

  const { data: allTags = [] } = useRequest2(getPluginToolTags, {
    manual: false
  });

  const templates = useMemo(() => {
    if (selectedTagIds.length === 0) {
      return rawTemplates;
    }
    return rawTemplates.filter((template) => {
      return template.tags?.some((tag) => selectedTagIds.includes(tag));
    });
  }, [rawTemplates, selectedTagIds]);

  const { data: paths = [] } = useRequest2(
    () => {
      return getAppToolPaths({ sourceId: parentId, type: 'current' });
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
      title={t('chat:home.select_tools')}
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
            placeholder={t('common:search_tool')}
          />
        </Box>
      </Box>
      {/* Tag filter */}
      {allTags.length > 0 && (
        <Box mt={3} mb={-1} px={[3, 6]}>
          <ToolTagFilterBox
            size="sm"
            tags={allTags}
            selectedTagIds={selectedTagIds}
            onTagSelect={setSelectedTagIds}
          />
        </Box>
      )}
      {/* route components */}
      {!searchKey && parentId && (
        <Flex mt={2} px={[3, 6]}>
          <FolderPath paths={paths} FirstPathDom={null} onClick={onUpdateParentId} />
        </Flex>
      )}
      <MyBox isLoading={isLoading} mt={2} pb={3} flex={'1 0 0'} h={0}>
        <Box px={[3, 6]} overflow={'overlay'} height={'100%'}>
          <RenderList
            templates={templates}
            setParentId={onUpdateParentId}
            allTags={allTags}
            {...props}
          />
        </Box>
      </MyBox>
    </MyModal>
  );
};

export default React.memo(ToolSelectModal);

const RenderList = React.memo(function RenderList({
  templates,
  onAddTool,
  onRemoveTool,
  setParentId,
  selectedTools,
  chatConfig = {},
  allTags
}: Props & {
  templates: NodeTemplateListItemType[];
  setParentId: (parentId: ParentIdType) => any;
  allTags: Array<{ tagId: string; tagName: any }>;
}) {
  const { t, i18n } = useTranslation();
  const { feConfigs } = useSystemStore();

  const [configTool, setConfigTool] = useState<FlowNodeTemplateType>();
  const onCloseConfigTool = useCallback(() => setConfigTool(undefined), []);
  const { toast } = useToast();

  const { runAsync: onClickAdd, loading: isLoading } = useRequest2(
    async (template: NodeTemplateListItemType) => {
      const res = await getToolPreviewNode({ appId: template.id });

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
          if (input.key === NodeInputKeyEnum.systemInputConfig) {
            return true;
          }

          // Check if input has any of the form render types
          const formRenderTypes = [
            FlowNodeInputTypeEnum.input,
            FlowNodeInputTypeEnum.textarea,
            FlowNodeInputTypeEnum.numberInput,
            FlowNodeInputTypeEnum.switch,
            FlowNodeInputTypeEnum.select,
            FlowNodeInputTypeEnum.JSONEditor
          ];

          return formRenderTypes.some((type) => input.renderTypeList.includes(type));
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

  const gridStyle = {
    gridTemplateColumns: ['1fr', '1fr 1fr'],
    py: 3,
    avatarSize: '1.75rem'
  };

  const PluginListRender = useMemoizedFn(() => {
    return (
      <>
        {templates.length > 0 ? (
          <Grid gridTemplateColumns={gridStyle.gridTemplateColumns} rowGap={3} columnGap={3} mt={3}>
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
                        <Box fontWeight={'bold'} ml={3} color={'myGray.900'} flex={'1'}>
                          {template.name}
                        </Box>
                        <Box color={'myGray.500'}>
                          By {template.author || feConfigs?.systemTitle}
                        </Box>
                      </Flex>
                      <Box mt={2} color={'myGray.500'} maxH={'100px'} overflow={'hidden'}>
                        {template.intro || t('common:core.workflow.Not intro')}
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
                    h={'100%'}
                  >
                    <MyAvatar
                      src={template.avatar}
                      w={gridStyle.avatarSize}
                      objectFit={'contain'}
                      borderRadius={'sm'}
                      flexShrink={0}
                    />
                    <Box flex={'1 0 0'} ml={3}>
                      <Box
                        color={'myGray.900'}
                        fontWeight={'500'}
                        fontSize={'sm'}
                        className="textEllipsis"
                      >
                        {t(parseI18nString(template.name, i18n.language))}
                      </Box>
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
                    ) : template.flowNodeType === 'toolSet' ? (
                      <Flex gap={2}>
                        <Button
                          size={'sm'}
                          variant={'whiteBase'}
                          isLoading={isLoading}
                          leftIcon={<MyIcon name={'common/arrowRight'} w={'16px'} mr={-1.5} />}
                          onClick={() => setParentId(template.id)}
                          px={2}
                          fontSize={'mini'}
                        >
                          {t('common:Open')}
                        </Button>
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
                      </Flex>
                    ) : template.isFolder ? (
                      <Button
                        size={'sm'}
                        variant={'whiteBase'}
                        leftIcon={<MyIcon name={'common/arrowRight'} w={'16px'} mr={-1.5} />}
                        onClick={() => setParentId(template.id)}
                        px={2}
                        fontSize={'mini'}
                      >
                        {t('common:Open')}
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
        ) : (
          <EmptyTip text={t('app:module.No Modules')} />
        )}
      </>
    );
  });

  return (
    <>
      <PluginListRender />

      {!!configTool && (
        <ConfigToolModal
          configTool={configTool}
          onCloseConfigTool={onCloseConfigTool}
          onAddTool={onAddTool}
        />
      )}
    </>
  );
});
