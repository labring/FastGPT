import React, { useCallback, useState, useMemo } from 'react';

import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import { Box, Button, Flex, Grid } from '@chakra-ui/react';
import FillRowTabs from '@fastgpt/web/components/common/Tabs/FillRowTabs';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import {
  type FlowNodeTemplateType,
  type NodeTemplateListItemType
} from '@fastgpt/global/core/workflow/type/node.d';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { getToolPreviewNode, getAppToolTemplates, getAppToolPaths } from '@/web/core/app/api/tool';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { getTeamAppTemplates } from '@/web/core/app/api/tool';
import { type ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import { getAppFolderPath } from '@/web/core/app/api/app';
import FolderPath from '@/components/common/folder/Path';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { useContextSelector } from 'use-context-selector';
import { AppContext } from '../../context';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';
import { useMemoizedFn } from 'ahooks';
import MyAvatar from '@fastgpt/web/components/common/Avatar';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { type AppSimpleEditFormType } from '@fastgpt/global/core/app/type';
import { useToast } from '@fastgpt/web/hooks/useToast';
import type { LLMModelItemType } from '@fastgpt/global/core/ai/model.d';
import { workflowStartNodeId } from '@/web/core/app/constants';
import ConfigToolModal from './ConfigToolModal';
import CostTooltip from '@/components/core/app/tool/CostTooltip';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import ToolTagFilterBox from '@fastgpt/web/components/core/plugin/tool/TagFilterBox';
import { getPluginToolTags } from '@/web/core/plugin/toolTag/api';
import { types } from 'util';
import { useRouter } from 'next/router';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';

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
  'systemTools' = 'systemTools',
  'myTools' = 'myTools',
  'agent' = 'agent'
}

const ToolSelectModal = ({ onClose, ...props }: Props & { onClose: () => void }) => {
  const { t } = useTranslation();
  const { appDetail } = useContextSelector(AppContext, (v) => v);

  const [templateType, setTemplateType] = useState(TemplateTypeEnum.systemTools);
  const [parentId, setParentId] = useState<ParentIdType>('');
  const [searchKey, setSearchKey] = useState('');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

  const {
    data: rawTemplates = [],
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
      if (type === TemplateTypeEnum.systemTools) {
        return getAppToolTemplates({ parentId, searchKey: searchVal });
      } else if (type === TemplateTypeEnum.myTools) {
        return getTeamAppTemplates({
          parentId,
          searchKey: searchVal,
          type: [
            AppTypeEnum.toolFolder,
            AppTypeEnum.workflowTool,
            AppTypeEnum.mcpToolSet,
            AppTypeEnum.httpToolSet
          ]
        }).then((res) => res.filter((app) => app.id !== appDetail._id));
      } else if (type === TemplateTypeEnum.agent) {
        return getTeamAppTemplates({
          parentId,
          searchKey: searchVal,
          type: [AppTypeEnum.folder, AppTypeEnum.simple, AppTypeEnum.workflow]
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

  const templates = useMemo(() => {
    if (selectedTagIds.length === 0 || templateType !== TemplateTypeEnum.systemTools) {
      return rawTemplates;
    }
    return rawTemplates.filter((template) => {
      // @ts-ignore
      return template.tags?.some((tag) => selectedTagIds.includes(tag));
    });
  }, [rawTemplates, selectedTagIds, templateType]);

  const { data: paths = [] } = useRequest2(
    () => {
      if (templateType === TemplateTypeEnum.systemTools)
        return getAppToolPaths({ sourceId: parentId, type: 'current' });
      return getAppFolderPath({ sourceId: parentId, type: 'current' });
    },
    {
      manual: false,
      refreshDeps: [parentId]
    }
  );

  const { data: allTags = [] } = useRequest2(getPluginToolTags, {
    manual: false
  });

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
              icon: 'common/app',
              label: t('app:core.module.template.System Tools'),
              value: TemplateTypeEnum.systemTools
            },
            {
              icon: 'core/app/type/plugin',
              label: t('common:navbar.Tools'),
              value: TemplateTypeEnum.myTools
            },
            {
              icon: 'core/chat/sidebar/star',
              label: 'Agent',
              value: TemplateTypeEnum.agent
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
        <Box w={200}>
          <SearchInput
            value={searchKey}
            onChange={(e) => setSearchKey(e.target.value)}
            placeholder={
              templateType === TemplateTypeEnum.systemTools
                ? t('common:search_tool')
                : t('app:search_app')
            }
          />
        </Box>
      </Box>
      {templateType === TemplateTypeEnum.systemTools && allTags.length > 0 && (
        <Box mt={3} px={[3, 6]}>
          <ToolTagFilterBox
            tags={allTags}
            selectedTagIds={selectedTagIds}
            onTagSelect={setSelectedTagIds}
            size="sm"
          />
        </Box>
      )}
      {/* route components */}
      {!searchKey && parentId && (
        <Flex mt={1} px={[3, 6]}>
          <FolderPath paths={paths} FirstPathDom={null} onClick={onUpdateParentId} />
        </Flex>
      )}
      <MyBox isLoading={isLoading} mt={1} pb={3} flex={'1 0 0'} h={0}>
        <Box overflow={'overlay'} height={'100%'}>
          <RenderList
            templates={templates}
            type={templateType}
            setParentId={onUpdateParentId}
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
  type,
  onAddTool,
  onRemoveTool,
  setParentId,
  selectedTools,
  chatConfig
}: Props & {
  templates: NodeTemplateListItemType[];
  type: TemplateTypeEnum;
  setParentId: (parentId: ParentIdType) => any;
}) {
  const { i18n } = useTranslation();
  const { t } = useSafeTranslation();
  const { feConfigs } = useSystemStore();
  const router = useRouter();

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

  const PluginListRender = useMemoizedFn(() => {
    const isSystemTool = type === TemplateTypeEnum.systemTools;
    return (
      <>
        {templates.length > 0 ? (
          <Grid gridTemplateColumns={['1fr', '1fr 1fr']} gap={3} px={[3, 6]}>
            {templates.map((template) => {
              const selected = selectedTools.some((tool) => tool.pluginId === template.id);
              return (
                <MyTooltip
                  key={template.id}
                  label={
                    <Box py={2} minW={['auto', '250px']}>
                      <Flex alignItems={'center'}>
                        <MyAvatar
                          src={template.avatar}
                          w={'1.75rem'}
                          objectFit={'contain'}
                          borderRadius={'sm'}
                        />
                        <Box fontWeight={'bold'} ml={3} color={'myGray.900'} overflow={'hidden'}>
                          {t(parseI18nString(template.name, i18n.language))}
                        </Box>
                        {isSystemTool && (
                          <Box color={'myGray.500'}>
                            By {template.author || feConfigs?.systemTitle}
                          </Box>
                        )}
                      </Flex>
                      <Box mt={2} color={'myGray.500'} maxH={'100px'} overflow={'hidden'}>
                        {t(parseI18nString(template.intro || '', i18n.language)) ||
                          t('common:core.workflow.Not intro')}
                      </Box>
                      {isSystemTool && (
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
                    py={3}
                    px={3}
                    _hover={{ bg: 'myWhite.600' }}
                    borderRadius={'sm'}
                    h={'100%'}
                  >
                    <MyAvatar
                      src={template.avatar}
                      w={'1.75rem'}
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
                    <Box flex={1} />

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
    <Flex position="relative" direction="column" h="100%">
      <Box overflowY="auto" mb={8} w={'full'}>
        <PluginListRender />
      </Box>
      {type === TemplateTypeEnum.systemTools && (
        <Flex
          alignItems="center"
          cursor="pointer"
          _hover={{
            color: 'primary.600'
          }}
          onClick={() => router.push('/plugin/tool')}
          gap={1}
          bottom={0}
          right={[3, 6]}
          position="absolute"
          zIndex={2}
        >
          <Box fontSize="sm">{t('app:find_more_tools')}</Box>
          <MyIcon name="common/rightArrowLight" w="0.9rem" />
        </Flex>
      )}
      {!!configTool && (
        <ConfigToolModal
          configTool={configTool}
          onCloseConfigTool={onCloseConfigTool}
          onAddTool={onAddTool}
        />
      )}
    </Flex>
  );
});
