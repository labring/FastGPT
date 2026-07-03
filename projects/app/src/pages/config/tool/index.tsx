'use client';

import { useMemo, useState } from 'react';
import { serviceSideProps } from '@/web/common/i18n/utils';
import { Box, Button, Center, Flex, useDisclosure } from '@chakra-ui/react';
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
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import { useRouter } from 'next/router';
import { getAdminSystemTools, putAdminUpdateToolOrder } from '@/web/core/plugin/admin/tool/api';
import type { GetAdminSystemToolsResponseType } from '@fastgpt/global/openapi/core/plugin/admin/tool/api';
import type { AdminSystemToolListItemType } from '@fastgpt/global/core/app/tool/systemTool/type';
import { useDebounce } from 'ahooks';
import { PluginStatusEnum, type PluginStatusType } from '@fastgpt/global/core/plugin/type';

const SystemToolConfigModal = dynamic(
  () => import('@/pageComponents/config/tool/SystemToolConfigModal')
);
const WorkflowToolConfig = dynamic(
  () => import('@/pageComponents/config/tool/WorkflowToolConfigModal')
);
const ImportPluginModal = dynamic(() => import('@/pageComponents/config/ImportPluginModal'));

const ToolProvider = () => {
  const { t } = useSafeTranslation();
  const router = useRouter();

  const [localTools, setLocalTools] = useState<GetAdminSystemToolsResponseType>([]);
  const [editingToolId, setEditingToolId] = useState<string>();
  const [searchKey, setSearchKey] = useState('');
  const [statusFilter, setStatusFilter] = useState<PluginStatusType>();
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
        label: t('common:All'),
        value: undefined
      },
      {
        label: t('app:toolkit_status_normal'),
        value: PluginStatusEnum.Normal
      },
      {
        label: t('app:toolkit_status_soon_offline'),
        value: PluginStatusEnum.SoonOffline
      },
      {
        label: t('app:toolkit_status_offline'),
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
  const isStatusFilterActive = statusFilter !== undefined;
  const isTagFilterActive = tagFilter !== undefined;
  const isTableFilterActive = isStatusFilterActive || isTagFilterActive;
  const statusFilterLabel = statusFilterOptions.find((item) => item.value === statusFilter)?.label;
  const tagFilterLabel = tagFilterOptions.find((item) => item.value === tagFilter)?.label;
  const displayTools = useMemo(() => {
    return localTools.filter((tool) => {
      if (statusFilter && tool.status !== statusFilter) return false;
      if (tagFilter && !tool.tags?.includes(tagFilter)) return false;
      return true;
    });
  }, [localTools, statusFilter, tagFilter]);

  return (
    <MyBox pt={4} pl={3} pr={8} isLoading={loadingTools}>
      {/* Header */}
      <Flex alignItems={'center'}>
        <Box flex={'1'} overflow={'auto'} color={'myGray.900'}>
          {t('common:navbar.plugin')}
        </Box>
        <Box mr={2}>
          <SearchInput
            maxW={['auto', '250px']}
            value={searchKey}
            onChange={(e) => setSearchKey(e.target.value)}
            placeholder={t('app:toolkit_search_placeholder')}
            bg={'white'}
            maxLength={30}
          />
        </Box>
        <Button onClick={onOpenTagModal} variant={'whiteBase'} mr={2}>
          {t('app:toolkit_tags_manage')}
        </Button>
        <MyMenu
          trigger="hover"
          Button={
            <Button leftIcon={<MyIcon name="common/addLight" w={'18px'} />}>
              {t('app:toolkit_add_resource')}
            </Button>
          }
          menuList={[
            {
              children: [
                {
                  label: t('app:toolkit_open_marketplace'),
                  onClick: () => {
                    router.push('/config/tool/marketplace');
                  }
                },
                {
                  label: t('app:toolkit_import_resource'),
                  onClick: () => {
                    onOpenImportModal();
                  }
                },
                {
                  label: t('app:toolkit_select_app'),
                  onClick: () => {
                    setEditingToolId('');
                  }
                }
              ]
            }
          ]}
        />
      </Flex>

      <Flex
        bg={'white'}
        mt={5}
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
                <Box>{isStatusFilterActive ? statusFilterLabel : t('app:toolkit_status')}</Box>
                <MyIcon name="core/chat/chevronDown" w={4} ml={1} />
              </Flex>
            }
            menuList={[
              {
                children: statusFilterOptions.map((item) => ({
                  label: item.label,
                  onClick: () => setStatusFilter(item.value),
                  isActive: item.value === statusFilter
                }))
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

      <Box overflow={'auto'} mt={2} h={'calc(100vh - 150px)'}>
        {displayTools.length > 0 ? (
          <DndDrag<AdminSystemToolListItemType>
            onDragEndCb={async (list: Array<AdminSystemToolListItemType>) => {
              const newOrder = list.map((item, index) => ({
                pluginId: item.id,
                pluginOrder: index
              }));
              setLocalTools(list);
              await putAdminUpdateToolOrder({ plugins: newOrder });
            }}
            dataList={displayTools}
          >
            {({ provided }) => (
              <Flex
                gap={1}
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
                    isDragDisabled={!!searchKey.trim() || isTableFilterActive}
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
  );
};

export async function getServerSideProps(content: any) {
  return {
    props: {
      ...(await serviceSideProps(content, ['app', 'file', 'admin_plugin']))
    }
  };
}

export default ToolProvider;
