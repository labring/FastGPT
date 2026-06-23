import React, { useCallback, useState, useMemo } from 'react';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import { useTranslation } from 'next-i18next';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import { Box, Button, Flex, Grid, IconButton } from '@chakra-ui/react';
import FillRowTabs from '@fastgpt/web/components/common/Tabs/FillRowTabs';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import {
  type FlowNodeTemplateType,
  type NodeTemplateListItemType
} from '@fastgpt/global/core/workflow/type/node';
import MyIcon from '@fastgpt/web/components/common/Icon';
import {
  getClientToolPreviewNode,
  getAppToolTemplates,
  getAppToolPaths
} from '@/web/core/app/api/tool';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { getTeamAppTemplates } from '@/web/core/app/api/tool';
import { type ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import { getAppFolderPath } from '@/web/core/app/api/app';
import FolderPath from '@/components/common/folder/Path';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { useContextSelector } from 'use-context-selector';
import { AppContext } from '../../../context';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';
import { useMemoizedFn } from 'ahooks';
import MyAvatar from '@fastgpt/web/components/common/Avatar';
import type { AppFormEditFormType } from '@fastgpt/global/core/app/formEdit/type';
import type { SelectedToolItemType } from '@fastgpt/global/core/app/formEdit/type';
import { useToast } from '@fastgpt/web/hooks/useToast';
import type { LLMModelItemType } from '@fastgpt/global/core/ai/model.schema';
import CostTooltip from '@/components/core/app/tool/CostTooltip';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import ToolTagFilterBox from '@fastgpt/web/components/core/plugin/tool/TagFilterBox';
import { getPluginToolTags } from '@/web/core/plugin/toolTag/api';
import { useRouter } from 'next/router';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import {
  getToolConfigStatus,
  validateToolConfiguration
} from '@fastgpt/global/core/app/formEdit/utils';

type Props = {
  topAgentSelectedTools?: SelectedToolItemType[];
  selectedTools: FlowNodeTemplateType[];
  fileSelectConfig: AppFormEditFormType['chatConfig']['fileSelectConfig'];
  selectedModel: LLMModelItemType;
  onAddTool: (tool: SelectedToolItemType) => void;
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
  } = useRequest(
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
      refreshDeps: [templateType, searchKey, parentId]
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

  const { data: paths = [] } = useRequest(
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

  const { data: allTags = [] } = useRequest(getPluginToolTags, {
    manual: false
  });

  const onUpdateParentId = useCallback(
    (parentId: ParentIdType) => {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }

      loadTemplates({
        parentId
      });
    },
    [loadTemplates]
  );

  useRequest(() => loadTemplates({ searchVal: searchKey }), {
    manual: false,
    throttleWait: 300,
    refreshDeps: [searchKey]
  });

  return (
    <MyModal
      isOpen
      title={
        <Flex alignItems={'center'} gap={2}>
          <MyIcon name="core/app/toolCall" w={'18px'} color={'primary.600'} />
          <Box>{t('app:tool_select')}</Box>
        </Flex>
      }
      onClose={onClose}
      size="lg"
      maxW={['90vw', '700px']}
      w={'700px'}
      h={['90vh', '80vh']}
      bodyStyles={{ p: 0, overflow: 'hidden' }}
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
            parentId={parentId}
            searchKey={searchKey}
            selectedTagIds={selectedTagIds}
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
  topAgentSelectedTools = [],
  templates,
  type,
  parentId,
  searchKey,
  selectedTagIds,
  onAddTool,
  onRemoveTool,
  setParentId,
  selectedTools,
  fileSelectConfig
}: Props & {
  templates: NodeTemplateListItemType[];
  type: TemplateTypeEnum;
  parentId: ParentIdType;
  searchKey: string;
  selectedTagIds: string[];
  setParentId: (parentId: ParentIdType) => any;
}) {
  const { i18n } = useTranslation();
  const { t } = useSafeTranslation();
  const { feConfigs } = useSystemStore();
  const router = useRouter();
  const { toast } = useToast();
  const listScopeKey = useMemo(
    () => `${type}:${parentId ?? ''}:${searchKey}:${selectedTagIds.join(',')}`,
    [parentId, searchKey, selectedTagIds, type]
  );
  const [tooltipEnabledScopeKey, setTooltipEnabledScopeKey] = useState('');
  const isTooltipEnabled = tooltipEnabledScopeKey === listScopeKey;

  const { runAsync: onClickAdd, loading: isLoading } = useRequest(
    async (template: NodeTemplateListItemType) => {
      const res = await getClientToolPreviewNode({ appId: template.id, versionId: '' });
      const isToolSetTemplate = template.flowNodeType === FlowNodeTypeEnum.toolSet;

      if (!isToolSetTemplate) {
        const toolValid = validateToolConfiguration({
          toolTemplate: res,
          canUploadFile: !!(
            fileSelectConfig?.canSelectFile ||
            fileSelectConfig?.canSelectImg ||
            fileSelectConfig?.canSelectVideo ||
            fileSelectConfig?.canSelectAudio ||
            fileSelectConfig?.canSelectCustomFileExtension
          )
        });
        if (!toolValid) {
          return toast({
            title: t('app:simple_tool_tips'),
            status: 'warning'
          });
        }
      }

      // 添加与 top 相同工具的配置
      const topTool = topAgentSelectedTools.find((tool) => tool.pluginId === res.pluginId);
      if (topTool) {
        res.inputs.forEach((input) => {
          const topInput = topTool.inputs.find((topInput) => topInput.key === input.key);
          if (topInput) {
            input.value = topInput.value;
          }
        });
      }
      onAddTool({
        ...res,
        configStatus: getToolConfigStatus({ tool: res }).status
      });
    }
  );

  const PluginListRender = useMemoizedFn(() => {
    const isSystemTool = type === TemplateTypeEnum.systemTools;
    return (
      <>
        {templates.length > 0 ? (
          <Grid
            key={listScopeKey}
            onMouseMove={() => setTooltipEnabledScopeKey(listScopeKey)}
            gridTemplateColumns={['minmax(0, 1fr)', 'repeat(2, minmax(0, 1fr))']}
            columnGap={3}
            rowGap={3}
            px={[3, 6]}
          >
            {templates.map((template) => {
              const selected = selectedTools.some((tool) => tool.pluginId === template.id);
              const name = t(parseI18nString(template.name, i18n.language));
              const intro =
                t(parseI18nString(template.intro || '', i18n.language)) ||
                t('common:core.workflow.Not intro');

              return (
                <MyTooltip
                  key={template.id}
                  isDisabled={!isTooltipEnabled}
                  label={
                    <Box py={2} minW={['auto', '250px']}>
                      <Flex alignItems={'center'} w={'100%'}>
                        <MyAvatar
                          src={template.avatar}
                          w={'1.75rem'}
                          objectFit={'contain'}
                          borderRadius={'sm'}
                        />
                        <Box
                          fontWeight={'bold'}
                          ml={3}
                          color={'myGray.900'}
                          flex={'1 0 0'}
                          overflow={'hidden'}
                        >
                          {name}
                        </Box>
                        {isSystemTool && (
                          <Box color={'myGray.500'}>
                            By {template.author || feConfigs?.systemTitle}
                          </Box>
                        )}
                      </Flex>
                      <Box mt={2} color={'myGray.500'} maxH={'100px'} overflow={'hidden'}>
                        {intro}
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
                  <Grid
                    alignItems={'center'}
                    gridTemplateColumns={'auto minmax(0, 1fr) auto'}
                    columnGap={2}
                    minW={0}
                    minH={'54px'}
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
                    <Box minW={0}>
                      <Box
                        color={'myGray.900'}
                        fontWeight={'500'}
                        fontSize={'sm'}
                        className="textEllipsis"
                      >
                        {name}
                      </Box>
                    </Box>
                    <Flex gap={2} minW={0} justifySelf={'end'} alignItems={'center'}>
                      {selected ? (
                        <IconButton
                          aria-label={t('common:Remove')}
                          size={'xsSquare'}
                          color={'myGray.600'}
                          minW={'24px'}
                          w={'24px'}
                          h={'24px'}
                          variant={'whiteDanger'}
                          icon={<MyIcon name={'delete'} w={'13px'} />}
                          onClick={() => onRemoveTool(template)}
                        />
                      ) : template.flowNodeType === 'toolSet' ? (
                        <>
                          <Button
                            size={'xs'}
                            variant={'whiteBase'}
                            h={'24px'}
                            minW={'unset'}
                            px={2}
                            isLoading={isLoading}
                            leftIcon={<MyIcon name={'common/arrowRight'} w={'14px'} />}
                            iconSpacing={1}
                            onClick={() => setParentId(template.id)}
                            fontSize={'mini'}
                            fontWeight={'500'}
                          >
                            {t('common:Open')}
                          </Button>
                          <IconButton
                            aria-label={t('common:Add')}
                            size={'xsSquare'}
                            minW={'24px'}
                            w={'24px'}
                            h={'24px'}
                            variant={'whiteBase'}
                            icon={<MyIcon name={'common/addLight'} w={'13px'} />}
                            isLoading={isLoading}
                            onClick={() => onClickAdd(template)}
                          />
                        </>
                      ) : template.isFolder ? (
                        <Button
                          size={'xs'}
                          variant={'whiteBase'}
                          h={'24px'}
                          minW={'unset'}
                          px={2}
                          isLoading={isLoading}
                          leftIcon={<MyIcon name={'common/arrowRight'} w={'14px'} />}
                          iconSpacing={1}
                          onClick={() => setParentId(template.id)}
                          fontSize={'mini'}
                          fontWeight={'500'}
                        >
                          {t('common:Open')}
                        </Button>
                      ) : (
                        <IconButton
                          aria-label={t('common:Add')}
                          size={'xsSquare'}
                          minW={'24px'}
                          w={'24px'}
                          h={'24px'}
                          variant={'whiteBase'}
                          icon={<MyIcon name={'common/addLight'} w={'13px'} />}
                          isLoading={isLoading}
                          onClick={() => onClickAdd(template)}
                        />
                      )}
                    </Flex>
                  </Grid>
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
        {PluginListRender()}
      </Box>
      {type === TemplateTypeEnum.systemTools && (
        <Flex
          alignItems="center"
          cursor="pointer"
          _hover={{
            color: 'primary.600'
          }}
          onClick={() => router.push('/dashboard/systemTool')}
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
    </Flex>
  );
});
