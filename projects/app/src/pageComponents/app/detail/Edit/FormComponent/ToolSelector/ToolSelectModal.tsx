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
import { getTeamAppTemplatesV2 } from '@/web/core/app/api/tool';
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
import type { MyLLMModelItemType } from '@fastgpt/global/openapi/core/ai/model/api';
import CostTooltip from '@/components/core/app/tool/CostTooltip';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import ToolTagFilterBox from '@fastgpt/web/components/core/plugin/tool/TagFilterBox';
import { getPluginToolTags } from '@/web/core/plugin/toolTag/api';
import { useRouter } from 'next/router';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import {
  getToolConfigStatus,
  validateToolConfiguration
} from '@fastgpt/global/core/app/formEdit/utils';
import { isDebugToolSource, getToolIdentityKey } from '@fastgpt/global/core/app/tool/utils';
import DebugToolTag from '@fastgpt/web/components/core/plugin/tool/DebugToolTag';
import SystemToolTag from '@fastgpt/web/components/core/plugin/tool/SystemToolTag';
import { inheritToolInputConfig } from './utils';
import { useScrollPagination } from '@fastgpt/web/hooks/useScrollPagination';
import { useVirtualGridList } from '@fastgpt/web/hooks/useVirtualGridList';

type Props = {
  generatedSelectedTools?: SelectedToolItemType[];
  selectedTools: FlowNodeTemplateType[];
  fileSelectConfig: AppFormEditFormType['chatConfig']['fileSelectConfig'];
  selectedModel: MyLLMModelItemType;
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

const teamToolTypes = [
  AppTypeEnum.toolFolder,
  AppTypeEnum.workflowTool,
  AppTypeEnum.mcpToolSet,
  AppTypeEnum.httpToolSet
];

const teamAgentTypes = [AppTypeEnum.folder, AppTypeEnum.simple, AppTypeEnum.workflow];

const ToolSelectModal = ({ onClose, ...props }: Props & { onClose: () => void }) => {
  const { t } = useTranslation();
  const { appDetail } = useContextSelector(AppContext, (v) => v);

  const [templateType, setTemplateType] = useState(TemplateTypeEnum.systemTools);
  const [parentId, setParentId] = useState<ParentIdType>('');
  const [parentSource, setParentSource] = useState<string>();
  const [searchKey, setSearchKey] = useState('');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

  const isTeamTemplate = templateType !== TemplateTypeEnum.systemTools;
  const teamTemplateTypes =
    templateType === TemplateTypeEnum.myTools ? teamToolTypes : teamAgentTypes;

  const {
    data: teamTemplates,
    isLoading: isTeamLoading,
    ScrollData: TeamScrollData
  } = useScrollPagination(getTeamAppTemplatesV2, {
    params: {
      parentId,
      searchKey: searchKey || undefined,
      type: teamTemplateTypes,
      excludeAppId: appDetail._id
    },
    pageSize: 50,
    disabled: !isTeamTemplate,
    refreshDeps: [isTeamTemplate, templateType, parentId, searchKey, appDetail._id]
  });

  const { data: systemTemplates = [], loading: isSystemLoading } = useRequest(
    () => {
      if (templateType !== TemplateTypeEnum.systemTools)
        return Promise.resolve<NodeTemplateListItemType[]>([]);
      return getAppToolTemplates({
        parentId,
        searchKey,
        source: parentId ? parentSource : undefined
      });
    },
    {
      manual: false,
      throttleWait: 300,
      refreshDeps: [templateType, parentId, parentSource, searchKey]
    }
  );

  const isLoading = isTeamTemplate ? isTeamLoading : isSystemLoading;
  const rawTemplates = isTeamTemplate ? teamTemplates : systemTemplates;

  const { gridRef, renderVirtualGridItems } = useVirtualGridList({
    list: teamTemplates,
    listKey: `${templateType}:${parentId ?? ''}:${searchKey}`,
    defaultColumnCount: 2,
    estimatedRowHeight: 54,
    estimatedRowGap: 12
  });

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
        return getAppToolPaths({ sourceId: parentId, source: parentSource, type: 'current' });
      return getAppFolderPath({ sourceId: parentId, type: 'current' });
    },
    {
      manual: false,
      refreshDeps: [parentId, parentSource]
    }
  );

  const { data: allTags = [] } = useRequest(getPluginToolTags, {
    manual: false
  });

  const onUpdateParentId = useCallback(
    (nextParentId: ParentIdType, source?: string) => {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      setParentId(nextParentId);
      setParentSource(nextParentId ? (source ?? parentSource) : undefined);
    },
    [parentSource]
  );

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
      bodyStyles={{ p: 0, minH: 0, overflow: 'hidden' }}
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
          onChange={(e) => {
            setTemplateType(e as TemplateTypeEnum);
            setParentId(null);
            setParentSource(undefined);
          }}
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
      <MyBox isLoading={isLoading} mt={1} pb={3} flex={'1 0 0'} h={0} minH={0}>
        {isTeamTemplate ? (
          <TeamScrollData flex={1} minH={0} isLoading={isLoading} showLoadingOverlay={false}>
            <RenderList
              templates={templates}
              type={templateType}
              parentId={parentId}
              searchKey={searchKey}
              selectedTagIds={selectedTagIds}
              setParentId={onUpdateParentId}
              isPaginated
              gridRef={gridRef}
              renderVirtualGridItems={renderVirtualGridItems}
              {...props}
            />
          </TeamScrollData>
        ) : (
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
        )}
      </MyBox>
    </MyModal>
  );
};

export default React.memo(ToolSelectModal);

const RenderList = React.memo(function RenderList({
  generatedSelectedTools = [],
  templates,
  type,
  parentId,
  searchKey,
  selectedTagIds,
  onAddTool,
  onRemoveTool,
  setParentId,
  selectedTools,
  fileSelectConfig,
  isPaginated,
  gridRef,
  renderVirtualGridItems
}: Props & {
  templates: NodeTemplateListItemType[];
  type: TemplateTypeEnum;
  parentId: ParentIdType;
  searchKey: string;
  selectedTagIds: string[];
  setParentId: (parentId: ParentIdType, source?: string) => any;
  isPaginated?: boolean;
  gridRef?: React.RefObject<HTMLDivElement>;
  renderVirtualGridItems?: (
    renderItem: (template: NodeTemplateListItemType) => React.ReactNode
  ) => React.ReactNode;
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
      const res = await getClientToolPreviewNode({
        appId: template.id,
        getLatestVersion: true,
        source: template.source
      });
      const toolValid = validateToolConfiguration({
        toolTemplate: res,
        isAppTool: true,
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

      // 添加与已生成工具相同的配置
      const generatedTool = generatedSelectedTools.find(
        (tool) =>
          getToolIdentityKey(tool.pluginId, tool.source) ===
          getToolIdentityKey(res.pluginId, res.source)
      );
      const tool = inheritToolInputConfig({ tool: res, sourceTool: generatedTool });
      onAddTool({
        ...tool,
        configStatus: getToolConfigStatus({ tool }).status
      });
    }
  );

  const renderTemplate = useMemoizedFn((template: NodeTemplateListItemType) => {
    const isSystemTool = type === TemplateTypeEnum.systemTools;
    const selected = selectedTools.some(
      (tool) =>
        getToolIdentityKey(tool.pluginId, tool.source) ===
        getToolIdentityKey(template.id, template.source)
    );
    const name = t(parseI18nString(template.name, i18n.language));
    const intro =
      t(parseI18nString(template.intro || '', i18n.language)) ||
      t('common:core.workflow.Not intro');
    const isDebugTool = isDebugToolSource(template.source);
    const isSystemSource = template.source === 'system';

    return (
      <MyTooltip
        key={getToolIdentityKey(template.id, template.source)}
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
              {isDebugTool && <DebugToolTag />}
              {isSystemTool && (
                <Box color={'myGray.500'}>By {template.author || feConfigs?.systemTitle}</Box>
              )}
            </Flex>
            <Box mt={2} color={'myGray.500'} maxH={'100px'} overflow={'hidden'}>
              {intro}
            </Box>
            {isSystemTool && (
              <CostTooltip cost={template.currentCost} hasTokenFee={template.hasTokenFee} />
            )}
          </Box>
        }
      >
        <Grid
          data-virtual-item=""
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
            <Flex alignItems={'center'} gap={2} minW={0}>
              <Box color={'myGray.900'} fontWeight={'500'} fontSize={'sm'} className="textEllipsis">
                {name}
              </Box>
              {feConfigs?.enable_team_plugin_upload === true && isSystemSource && <SystemToolTag />}
              {isDebugTool && <DebugToolTag />}
            </Flex>
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
                  onClick={() => setParentId(template.id, template.source)}
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
                onClick={() => setParentId(template.id, template.source)}
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
  });

  const PluginListRender = useMemoizedFn(() => {
    return (
      <>
        {templates.length > 0 ? (
          <Grid
            ref={gridRef}
            key={listScopeKey}
            onMouseMove={() => setTooltipEnabledScopeKey(listScopeKey)}
            gridTemplateColumns={['minmax(0, 1fr)', 'repeat(2, minmax(0, 1fr))']}
            columnGap={3}
            rowGap={3}
            px={[3, 6]}
          >
            {renderVirtualGridItems
              ? renderVirtualGridItems(renderTemplate)
              : templates.map(renderTemplate)}
          </Grid>
        ) : (
          <EmptyTip text={t('app:module.No Modules')} />
        )}
      </>
    );
  });

  return (
    <Flex
      position="relative"
      direction="column"
      minH={isPaginated ? 0 : undefined}
      h={isPaginated ? 'auto' : '100%'}
    >
      <Box overflowY={isPaginated ? 'visible' : 'auto'} mb={isPaginated ? 0 : 8} w={'full'}>
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
