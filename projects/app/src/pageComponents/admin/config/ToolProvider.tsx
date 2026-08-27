'use client';

import { useMemo, useState } from 'react';
import { Box, Button, Center, Checkbox, Flex, useDisclosure } from '@chakra-ui/react';
import MyBox from '@fastgpt/web/components/common/MyBox';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyMenu from '@fastgpt/web/components/common/MyMenu';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import DndDrag, { Draggable } from '@fastgpt/web/components/common/DndDrag';
import { AppToolSourceEnum } from '@fastgpt/global/core/app/tool/constants';
import { splitCombineToolId } from '@fastgpt/global/core/app/tool/utils';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import ToolRow from '@/pageComponents/config/tool/ToolRow';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import TagManageModal from '@/pageComponents/config/TagManageModal';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import { getAdminSystemTools, putAdminUpdateToolOrder } from '@/web/core/plugin/admin/tool/api';
import type { GetAdminSystemToolsResponseType } from '@fastgpt/global/openapi/core/plugin/admin/tool/api';
import type { AdminSystemToolListItemType } from '@fastgpt/global/core/app/tool/systemTool/type';
import { useDebounce } from 'ahooks';
import { PluginStatusEnum, type PluginStatusType } from '@fastgpt/global/core/plugin/type';
import AdminContainer from '@/pageComponents/admin/AdminContainer';
import { accountPageRootStyles, accountTitleTextStyles } from '@/pageComponents/account/styles';
import { useClientTranslation } from '@fastgpt/web/i18n/useClientTranslation';

const allPluginStatuses: PluginStatusType[] = [
  PluginStatusEnum.Normal,
  PluginStatusEnum.Hidden,
  PluginStatusEnum.SoonOffline,
  PluginStatusEnum.Offline
];

const defaultStatusFilter: PluginStatusType[] = [
  PluginStatusEnum.Normal,
  PluginStatusEnum.Hidden,
  PluginStatusEnum.SoonOffline
];

const SystemToolConfigModal = dynamic(
  () => import('@/pageComponents/config/tool/SystemToolConfigModal')
);
const WorkflowToolConfig = dynamic(
  () => import('@/pageComponents/config/tool/WorkflowToolConfigModal')
);
const ImportPluginModal = dynamic(() => import('@/pageComponents/config/ImportPluginModal'));

const ToolProvider = () => {
  const { t } = useClientTranslation(['app', 'file', 'admin_plugin', 'config']);
  const router = useRouter();

  const [localTools, setLocalTools] = useState<GetAdminSystemToolsResponseType>([]);
  const [editingToolId, setEditingToolId] = useState<string>();
  const [searchKey, setSearchKey] = useState('');
  const [statusFilter, setStatusFilter] = useState<PluginStatusType[]>(defaultStatusFilter);
  const [tagFilter, setTagFilter] = useState<string>();
  const debouncedSearchKey = useDebounce(searchKey, { wait: 300 });
  const requestSearchKey = debouncedSearchKey.trim();

  const {
    isOpen: isOpenTagModal,
    onOpen: onOpenTagModal,
    onClose: onCloseTagModal
  } = useDisclosure();
  const {
    isOpen: isOpenImportModal,
    onOpen: onOpenImportModal,
    onClose: onCloseImportModal
  } = useDisclosure();

  const { runAsync: refreshTools, loading: loadingTools } = useRequest(
    () => getAdminSystemTools({ searchKey: requestSearchKey || undefined }),
    {
      onSuccess: (data) => {
        if (data) {
          setLocalTools(data);
        }
      },
      refreshDeps: [requestSearchKey],
      manual: false
    }
  );
  const statusFilterOptions = useMemo(
    () => [
      {
        label: t('app:toolkit_status_normal'),
        value: PluginStatusEnum.Normal
      },
      {
        label: t('app:toolkit_status_hidden'),
        value: PluginStatusEnum.Hidden
      },
      {
        label: t('app:toolkit_status_soon_offline'),
        value: PluginStatusEnum.SoonOffline
      },
      {
        label: t('common:error.tool_not_exist'),
        value: PluginStatusEnum.Offline
      }
    ],
    [t]
  );
  const tagFilterOptions = useMemo(
    () => [
      {
        label: t('common:All'),
        value: undefined
      },
      ...Array.from(new Set(localTools.flatMap((tool) => tool.tags || [])))
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b))
        .map((tag) => ({
          label: tag,
          value: tag
        }))
    ],
    [localTools, t]
  );
  const isAllStatusSelected = statusFilter.length === allPluginStatuses.length;
  const isStatusFilterActive = !isAllStatusSelected;
  const isTagFilterActive = tagFilter !== undefined;
  const tagFilterLabel = tagFilterOptions.find((item) => item.value === tagFilter)?.label;
  const displayTools = useMemo(() => {
    return localTools.filter((tool) => {
      if (!statusFilter.includes(tool.status)) return false;
      if (tagFilter && !tool.tags?.includes(tagFilter)) return false;
      return true;
    });
  }, [localTools, statusFilter, tagFilter]);

  return (
    <AdminContainer>
      {/* 迁移自原 /config 页面：整体白底内容区（原 ConfigContainer 内容区为白色） */}
      <Flex {...accountPageRootStyles} bg={'white'} flexDirection={'column'}>
        <Flex
          h={['auto', '64px']}
          py={[6, 0]}
          flexShrink={0}
          px={6}
          alignItems={['stretch', 'center']}
          flexDirection={['column', 'row']}
          borderBottom={'1px solid'}
          borderColor={'myGray.200'}
        >
          <Box as={'h1'} display={['none', 'block']} {...accountTitleTextStyles}>
            {t('config:system_tool_management')}
          </Box>
          <Flex
            ml={[0, 'auto']}
            w={['100%', 'auto']}
            alignItems={['stretch', 'center']}
            flexDirection={['column', 'row']}
            gap={[3, 0]}
          >
            <Box w={['100%', 'auto']} mr={[0, 2]}>
              <SearchInput
                w={'100%'}
                maxW={['100%', '250px']}
                value={searchKey}
                onChange={(e) => setSearchKey(e.target.value)}
                placeholder={t('app:toolkit_search_placeholder')}
                bg={'myGray.25'}
                maxLength={30}
              />
            </Box>
            <Button w={['100%', 'auto']} onClick={onOpenTagModal} variant={'whiteBase'} mr={[0, 2]}>
              {t('app:toolkit_tags_manage')}
            </Button>
            <MyMenu
              trigger="hover"
              Button={
                <Button
                  w={['100%', 'auto']}
                  leftIcon={<MyIcon name="common/addLight" w={'18px'} />}
                >
                  {t('app:install_tool')}
                </Button>
              }
              menuList={[
                {
                  children: [
                    {
                      label: t('app:install_from_marketplace'),
                      onClick: () => router.push('/config/plugin/marketplace')
                    },
                    {
                      label: t('app:install_from_file'),
                      onClick: onOpenImportModal
                    }
                  ]
                }
              ]}
            />
          </Flex>
        </Flex>

        <MyBox
          flex={'1 0 0'}
          minH={['calc(100dvh - 78px)', 0]}
          py={6}
          display={'flex'}
          flexDirection={'column'}
          isLoading={loadingTools}
        >
          <Box px={6} flex={'1 0 0'} minH={0} overflow={'auto'}>
            <Flex
              bg={'myGray.100'}
              minW={'900px'}
              h={'50px'}
              rounded={'md'}
              alignItems={'center'}
              fontSize={'mini'}
              fontWeight={'medium'}
              color={'myGray.600'}
            >
              <Box w={2.2 / 10} pl={8}>
                {t('app:toolkit_name')}
              </Box>
              <Box w={1.5 / 10}>
                <MyMenu
                  trigger="hover"
                  placement="bottom-start"
                  Button={
                    <Flex
                      alignItems={'center'}
                      cursor={'pointer'}
                      w={'fit-content'}
                      maxW={'100%'}
                      color={isTagFilterActive ? 'primary.600' : 'inherit'}
                    >
                      <Box maxW={'110px'} className="textEllipsis">
                        {isTagFilterActive ? tagFilterLabel || tagFilter : t('app:toolkit_tags')}
                      </Box>
                      <MyIcon name="core/chat/chevronDown" w={4} ml={1} flexShrink={0} />
                    </Flex>
                  }
                  menuList={[
                    {
                      children: tagFilterOptions.map((item) => ({
                        label: item.label,
                        onClick: () => setTagFilter(item.value),
                        isActive: item.value === tagFilter
                      }))
                    }
                  ]}
                />
              </Box>
              <Box w={4.1 / 10}>{t('common:Intro')}</Box>
              <Box w={1.1 / 10} pl={6}>
                <MyMenu
                  trigger="hover"
                  placement="bottom-start"
                  Button={
                    <Flex
                      alignItems={'center'}
                      cursor={'pointer'}
                      w={'fit-content'}
                      color={isStatusFilterActive ? 'primary.600' : 'inherit'}
                    >
                      <Box>{t('app:toolkit_status')}</Box>
                      <MyIcon
                        name={isStatusFilterActive ? 'common/filter' : 'core/chat/chevronDown'}
                        w={isStatusFilterActive ? 3.5 : 4}
                        ml={1}
                        fill={isStatusFilterActive ? 'none' : 'currentColor'}
                      />
                    </Flex>
                  }
                  menuList={[
                    {
                      children: [
                        {
                          label: (
                            <Checkbox
                              size={'sm'}
                              isChecked={isAllStatusSelected}
                              isIndeterminate={statusFilter.length > 0 && !isAllStatusSelected}
                              pointerEvents={'none'}
                            >
                              {t('common:All')}
                            </Checkbox>
                          ),
                          closeOnClick: false,
                          onClick: () =>
                            setStatusFilter(isAllStatusSelected ? [] : [...allPluginStatuses])
                        },
                        ...statusFilterOptions.map((item) => ({
                          label: (
                            <Checkbox
                              size={'sm'}
                              isChecked={statusFilter.includes(item.value)}
                              pointerEvents={'none'}
                            >
                              {item.label}
                            </Checkbox>
                          ),
                          closeOnClick: false,
                          onClick: () =>
                            setStatusFilter((statuses) =>
                              statuses.includes(item.value)
                                ? statuses.filter((status) => status !== item.value)
                                : [...statuses, item.value]
                            )
                        }))
                      ]
                    }
                  ]}
                />
              </Box>
              <Box w={1.1 / 10} display={'flex'} alignItems={'center'}>
                {t('app:toolkit_system_key')}
                <QuestionTip
                  display={'flex'}
                  alignItems={'center'}
                  ml={1}
                  label={t('app:toolkit_system_key_tip')}
                  color={'myGray.300'}
                />
              </Box>
            </Flex>

            <Box mt={2} minW={'900px'}>
              {displayTools.length > 0 ? (
                <DndDrag<AdminSystemToolListItemType>
                  onDragEndCb={async (list: Array<AdminSystemToolListItemType>) => {
                    const visibleToolIds = new Set(list.map((item) => item.id));
                    let visibleToolIndex = 0;
                    const reorderedTools = localTools.map((item) =>
                      visibleToolIds.has(item.id) ? list[visibleToolIndex++] : item
                    );
                    const newOrder = reorderedTools.map((item, index) => ({
                      pluginId: item.id,
                      pluginOrder: index
                    }));
                    setLocalTools(reorderedTools);
                    await putAdminUpdateToolOrder({ plugins: newOrder });
                  }}
                  dataList={displayTools}
                >
                  {({ provided }) => (
                    <Flex
                      gap={0}
                      flex={1}
                      flexDirection={'column'}
                      {...provided.droppableProps}
                      ref={provided.innerRef}
                    >
                      {displayTools.map((item, index) => (
                        <Draggable
                          key={item.id}
                          draggableId={item.id}
                          index={index}
                          isDragDisabled={!!searchKey.trim()}
                        >
                          {(provided, snapshot) => (
                            <ToolRow
                              key={item.id}
                              tool={item}
                              setEditingToolId={setEditingToolId}
                              provided={provided}
                              snapshot={snapshot}
                            />
                          )}
                        </Draggable>
                      ))}
                    </Flex>
                  )}
                </DndDrag>
              ) : (
                <Center h={'full'}>
                  <EmptyTip text={t('app:toolkit_no_plugins')} py={2} />
                </Center>
              )}
            </Box>
          </Box>

          {isOpenTagModal && <TagManageModal onClose={onCloseTagModal} />}
          {isOpenImportModal && (
            <ImportPluginModal
              onClose={onCloseImportModal}
              onSuccess={refreshTools}
              tools={localTools}
            />
          )}
          {editingToolId !== undefined &&
            splitCombineToolId(editingToolId).source === AppToolSourceEnum.systemTool && (
              <SystemToolConfigModal
                toolId={editingToolId}
                onSuccess={refreshTools}
                onClose={() => setEditingToolId(undefined)}
              />
            )}
          {editingToolId !== undefined &&
            splitCombineToolId(editingToolId).source !== AppToolSourceEnum.systemTool && (
              <WorkflowToolConfig
                toolId={editingToolId}
                onSuccess={refreshTools}
                onClose={() => setEditingToolId(undefined)}
              />
            )}
        </MyBox>
      </Flex>
    </AdminContainer>
  );
};

export default ToolProvider;
