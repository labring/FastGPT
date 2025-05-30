import {
  Box,
  Flex,
  HStack,
  Text,
  IconButton,
  Button,
  useDisclosure,
  Tooltip,
  Wrap,
  WrapItem,
  Checkbox,
  Menu,
  MenuButton,
  MenuList,
  MenuItem
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import React, { useMemo, useState, useEffect, useCallback } from 'react';
import MySelect from '@fastgpt/web/components/common/MySelect';
import MultipleSelect, {
  useMultipleSelect
} from '@fastgpt/web/components/common/MySelect/MultipleSelect';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { delAppById } from '@/web/core/app/api';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import type { AppListItemType } from '@fastgpt/global/core/app/type.d';
import { getTeamTags } from '@/web/core/app/api/tags';
import type { TagSchemaType } from '@fastgpt/global/core/app/tags';
import GateAppInfoModal from './GateAppInfoModal';
import TagManageModal from './TagManageModal';
import DndDrag, { Draggable } from '@fastgpt/web/components/common/DndDrag';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import { listFeatureApps, reorderFeatureApps } from '@/web/support/user/team/gate/featureApp';
import AddFeatureAppModal from './AddFeatureAppModal';

// 设置最大可见标签数
const MAX_VISIBLE_TAGS = 2;

// 自定义 hook：应用选择逻辑
const useAppSelection = (filteredApps: AppListItemType[]) => {
  const [selectedAppIds, setSelectedAppIds] = useState<string[]>([]);

  const handleAppSelect = useCallback((appId: string, isSelected: boolean) => {
    setSelectedAppIds((prev) =>
      isSelected ? [...prev.filter((id) => id !== appId), appId] : prev.filter((id) => id !== appId)
    );
  }, []);

  const handleSelectAll = useCallback(
    (isSelected: boolean) => {
      setSelectedAppIds(isSelected ? filteredApps.map((app) => app._id) : []);
    },
    [filteredApps]
  );

  const isAllSelected = useMemo(
    () => filteredApps.length > 0 && filteredApps.every((app) => selectedAppIds.includes(app._id)),
    [filteredApps, selectedAppIds]
  );

  const isIndeterminate = useMemo(() => {
    const selectedCount = filteredApps.filter((app) => selectedAppIds.includes(app._id)).length;
    return selectedCount > 0 && selectedCount < filteredApps.length;
  }, [filteredApps, selectedAppIds]);

  return {
    selectedAppIds,
    handleAppSelect,
    handleSelectAll,
    isAllSelected,
    isIndeterminate
  };
};

// 标签组件
const AppTags = ({ tags, tagMap }: { tags?: string[]; tagMap: Map<string, TagSchemaType> }) => {
  if (!tags?.length) return null;

  const validTags = tags.filter((tagId) => tagMap.get(tagId));
  const visibleTags = validTags.slice(0, MAX_VISIBLE_TAGS);
  const remainingCount = Math.max(0, validTags.length - MAX_VISIBLE_TAGS);

  const TagItem = ({ tagId }: { tagId: string }) => {
    const tag = tagMap.get(tagId);
    if (!tag) return null;

    return (
      <Flex
        padding="10px 8px"
        justifyContent="center"
        alignItems="center"
        height="22px"
        minWidth="32px"
        borderRadius="6px"
        backgroundColor="#F4F4F5"
      >
        <Text
          fontSize="12px"
          fontWeight="500"
          lineHeight="16px"
          color="#525252"
          overflow="hidden"
          textOverflow="ellipsis"
          whiteSpace="nowrap"
        >
          {tag.name}
        </Text>
      </Flex>
    );
  };

  return (
    <HStack spacing={2} wrap="wrap">
      {visibleTags.map((tagId) => (
        <TagItem key={tagId} tagId={tagId} />
      ))}
      {remainingCount > 0 && (
        <Tooltip
          label={
            <Wrap spacing={2} maxW="300px" p={2}>
              {validTags.slice(MAX_VISIBLE_TAGS).map((tagId) => (
                <WrapItem key={tagId}>
                  <TagItem tagId={tagId} />
                </WrapItem>
              ))}
            </Wrap>
          }
          hasArrow
          placement="top"
          bg="white"
          boxShadow="lg"
        >
          <Flex
            padding="10px 8px"
            justifyContent="center"
            alignItems="center"
            height="22px"
            width="31px"
            borderRadius="6px"
            backgroundColor="#F4F4F5"
          >
            <Text fontSize="12px" fontWeight="500" color="#525252">
              +{remainingCount}
            </Text>
          </Flex>
        </Tooltip>
      )}
    </HStack>
  );
};

// 应用行组件
const AppRow = ({
  app,
  index,
  tagMap,
  selectedAppIds,
  onAppSelect,
  onEdit,
  onDelete
}: {
  app: AppListItemType;
  index: number;
  tagMap: Map<string, TagSchemaType>;
  selectedAppIds: string[];
  onAppSelect: (appId: string, isSelected: boolean) => void;
  onEdit: (app: AppListItemType) => void;
  onDelete: (appId: string) => void;
}) => {
  return (
    <Draggable key={app._id} draggableId={String(app._id)} index={index}>
      {(provided, snapshot) => (
        <MyBox
          ref={provided.innerRef}
          {...provided.draggableProps}
          style={{
            ...provided.draggableProps.style,
            opacity: snapshot.isDragging ? 0.8 : 1
          }}
          display="flex"
          pl={2}
          bg="white"
          h={12}
          w="full"
          borderBottom="1px solid var(--Gray-Modern-150, #F0F1F6)"
          _hover={{
            bg: 'white',
            border: '1px solid var(--Gray-Modern-200, #E8EBF0)',
            boxShadow:
              '0px 4px 4px 0px rgba(19, 51, 107, 0.05), 0px 0px 1px 0px rgba(19, 51, 107, 0.08)',
            borderRadius: '6px',
            zIndex: 2
          }}
          fontSize="mini"
          alignItems="center"
        >
          {/* 名称列 */}
          <Box display="flex" w="20%">
            <Flex alignItems="center" gap="10px" width="100%" pl="24px">
              <Checkbox
                isChecked={selectedAppIds.includes(app._id)}
                onChange={(e) => {
                  e.stopPropagation();
                  onAppSelect(app._id, e.target.checked);
                }}
                size="sm"
              />

              <Flex {...provided.dragHandleProps} cursor="grab">
                <MyIcon name="drag" w="10.5px" h="14px" color="#667085" />
              </Flex>

              <Flex gap="6px" alignItems="center">
                <Flex
                  w="20px"
                  h="20px"
                  borderRadius="4px"
                  overflow="hidden"
                  justifyContent="center"
                  alignItems="center"
                  bg={
                    app.avatar
                      ? 'transparent'
                      : 'linear-gradient(200.75deg, #61D2C4 13.74%, #40CAA1 89.76%)'
                  }
                  boxShadow="sm"
                >
                  {app.avatar ? (
                    <Avatar src={app.avatar} alt={app.name} w="100%" h="100%" />
                  ) : (
                    <Text color="white" fontSize="16px" fontWeight="bold">
                      {app.name.charAt(0).toUpperCase()}
                    </Text>
                  )}
                </Flex>

                <Text
                  fontSize="12px"
                  fontWeight="500"
                  color="#111824"
                  maxWidth="60px"
                  overflow="hidden"
                  textOverflow="ellipsis"
                  whiteSpace="nowrap"
                >
                  {app.name}
                </Text>
              </Flex>
            </Flex>
          </Box>

          {/* 介绍列 */}
          <Box w="40%" pl={4}>
            <Text color="myGray.500" noOfLines={1}>
              {app.intro}
            </Text>
          </Box>

          {/* 标签列 */}
          <Box w="30%" pl={4}>
            <AppTags tags={app.tags} tagMap={tagMap} />
          </Box>

          {/* 操作列 */}
          <Flex w="10%" justifyContent="center">
            <HStack spacing={2}>
              <IconButton
                size="sm"
                variant="ghost"
                icon={<MyIcon name="edit" w="14px" />}
                aria-label="edit"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(app);
                }}
              />
              <IconButton
                size="sm"
                variant="ghost"
                colorScheme="red"
                icon={<MyIcon name="delete" w="14px" />}
                aria-label="delete"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(app._id);
                }}
              />
            </HStack>
          </Flex>
        </MyBox>
      )}
    </Draggable>
  );
};

const AppTable = () => {
  const { t } = useTranslation();
  const [editingApp, setEditingApp] = useState<AppListItemType | null>(null);
  const [search, setSearch] = useState('');
  const [localAppList, setLocalAppList] = useState<AppListItemType[]>([]);

  // 使用多选标签的 hook
  const {
    value: selectedTags,
    setValue: setSelectedTags,
    isSelectAll,
    setIsSelectAll
  } = useMultipleSelect<string>([], false);

  // 模态框状态
  const tagModal = useDisclosure();
  const addAppModal = useDisclosure();

  // API 请求
  const {
    data: appList = [],
    loading: loadingApps,
    refresh: refreshApps
  } = useRequest2(() => listFeatureApps(), { manual: false });

  const {
    data: tagList = [],
    loading: loadingTags,
    refresh: refreshTags
  } = useRequest2(() => getTeamTags(), { manual: false });

  const { runAsync: onReorderApps } = useRequest2(
    ({ appId, toIndex }: { appId: string; toIndex: number }) => reorderFeatureApps(appId, toIndex),
    {
      onSuccess: refreshApps,
      errorToast: t('common:reorder_failed')
    }
  );

  const { openConfirm: openConfirmDel, ConfirmModal: DelConfirmModal } = useConfirm({
    type: 'delete'
  });

  const { runAsync: onDeleteApp } = useRequest2(delAppById, {
    onSuccess: refreshApps,
    successToast: t('common:delete_success'),
    errorToast: t('common:delete_failed')
  });

  // 计算属性
  const loading = loadingApps || loadingTags;

  const tagMap = useMemo(() => {
    const map = new Map<string, TagSchemaType>();
    (tagList as TagSchemaType[]).forEach((tag) => map.set(tag._id, tag));
    return map;
  }, [tagList]);

  const filteredApps = useMemo(() => {
    return localAppList.filter((app) => {
      const searchMatch =
        !search ||
        app.name.toLowerCase().includes(search.toLowerCase()) ||
        app.intro?.toLowerCase().includes(search.toLowerCase());

      // 多选标签筛选逻辑：如果选择了全部或没有选择任何标签，显示所有应用
      // 如果选择了特定标签，应用必须包含至少一个选中的标签
      const tagMatch =
        isSelectAll ||
        selectedTags.length === 0 ||
        (app.tags && app.tags.some((tag) => selectedTags.includes(tag)));

      return searchMatch && tagMatch;
    });
  }, [localAppList, search, selectedTags, isSelectAll]);

  const allTags = useMemo(
    () =>
      Array.from(new Set(appList.flatMap((app) => app.tags || []))).map((tag) => ({
        label: tagMap.get(tag)?.name || tag,
        value: tag
      })),
    [appList, tagMap]
  );

  // 自定义 hooks
  const selection = useAppSelection(filteredApps);

  // 副作用
  useEffect(() => {
    setLocalAppList(appList);
  }, [appList]);

  // 事件处理
  const handleDragEnd = async (list: AppListItemType[]) => {
    // 先更新本地状态以提供即时反馈
    setLocalAppList(list);

    // 找到被移动的应用 - 需要找到移动距离最大的那个应用
    let movedApp: AppListItemType | null = null;
    let originalIndex = -1;
    let newIndex = -1;
    let maxDistance = 0;

    // 找到位置发生变化的应用中移动距离最大的（这个就是被拖拽的应用）
    for (let i = 0; i < list.length; i++) {
      const currentApp = list[i];
      const origIndex = filteredApps.findIndex((app) => app._id === currentApp._id);

      if (origIndex !== -1 && origIndex !== i) {
        const distance = Math.abs(origIndex - i);
        if (distance > maxDistance) {
          maxDistance = distance;
          movedApp = currentApp;
          originalIndex = origIndex;
          newIndex = i;
        }
      }
    }

    if (movedApp && originalIndex !== -1 && newIndex !== -1) {
      try {
        // 计算在完整应用列表中的目标位置
        let targetIndex: number;

        if (newIndex === 0) {
          // 移动到第一位
          targetIndex = 0;
        } else if (newIndex === list.length - 1) {
          // 移动到最后一位，找到最后一个应用在完整列表中的位置
          const lastApp = list[newIndex - 1];
          const lastAppIndexInFullList = appList.findIndex((app) => app._id === lastApp._id);
          targetIndex = lastAppIndexInFullList + 1;
        } else {
          // 移动到中间位置
          if (originalIndex < newIndex) {
            // 向下拖拽：目标位置是新位置后面那个应用在完整列表中的位置
            const nextApp = list[newIndex + 1];
            const nextAppIndexInFullList = appList.findIndex((app) => app._id === nextApp._id);
            targetIndex = nextAppIndexInFullList - 1;
          } else {
            // 向上拖拽：目标位置是新位置前面那个应用在完整列表中的位置+1
            const prevApp = list[newIndex - 1];
            const prevAppIndexInFullList = appList.findIndex((app) => app._id === prevApp._id);
            targetIndex = prevAppIndexInFullList + 1;
          }
        }

        console.log('拖拽信息:', {
          appName: movedApp.name,
          originalIndex,
          newIndex,
          targetIndex,
          direction: originalIndex < newIndex ? '向下' : '向上'
        });

        await onReorderApps({
          appId: movedApp._id,
          toIndex: targetIndex
        });
      } catch (error) {
        console.error('重新排序失败:', error);
        // 如果失败，恢复原始状态
        setLocalAppList(appList);
      }
    }
  };

  const handleTagModalClose = () => {
    tagModal.onClose();
    refreshTags();
    refreshApps();
  };

  const handleAddAppSuccess = (selectedApps: any) => {
    console.log('Selected apps:', selectedApps);
    refreshApps();
  };

  return (
    <MyBox flex="1 0 0" isLoading={loading}>
      <Flex flexDirection="column" h="100%">
        {/* 筛选控件 */}
        <Flex
          gap={4}
          mb={4}
          flexDirection={{ base: 'column', md: 'row' }}
          alignItems={{ base: 'stretch', md: 'center' }}
        >
          <Flex flex={1} gap={4}>
            <SearchInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('app:search_app')}
              flex={1}
            />
            <Box w="200px">
              <Menu closeOnSelect={false}>
                <MenuButton
                  as={Button}
                  rightIcon={<MyIcon name={'core/chat/chevronDown'} w={4} color={'myGray.500'} />}
                  variant={'outline'}
                  size={'sm'}
                  fontSize={'sm'}
                  textAlign={'left'}
                  w="100%"
                  justifyContent="space-between"
                >
                  {isSelectAll
                    ? t('common:All')
                    : selectedTags.length === 0
                      ? t('common:select_tag')
                      : `已选择: ${selectedTags.length}`}
                </MenuButton>
                <MenuList maxH="300px" overflowY="auto">
                  <MenuItem
                    onClick={(e) => {
                      e.preventDefault();
                      if (isSelectAll) {
                        setSelectedTags([]);
                        setIsSelectAll(false);
                      } else {
                        setSelectedTags(allTags.map((tag) => tag.value));
                        setIsSelectAll(true);
                      }
                    }}
                  >
                    <Checkbox
                      isChecked={isSelectAll}
                      mr={2}
                      onChange={(e) => {
                        e.stopPropagation();
                        if (isSelectAll) {
                          setSelectedTags([]);
                          setIsSelectAll(false);
                        } else {
                          setSelectedTags(allTags.map((tag) => tag.value));
                          setIsSelectAll(true);
                        }
                      }}
                    />
                    {t('common:All')}
                  </MenuItem>
                  {allTags.map((tag) => (
                    <MenuItem
                      key={tag.value}
                      onClick={(e) => {
                        e.preventDefault();
                        if (isSelectAll) {
                          // 如果当前是全选状态，取消全选并只选择当前项
                          setSelectedTags([tag.value]);
                          setIsSelectAll(false);
                        } else {
                          // 正常的多选逻辑
                          if (selectedTags.includes(tag.value)) {
                            setSelectedTags(selectedTags.filter((t) => t !== tag.value));
                          } else {
                            setSelectedTags([...selectedTags, tag.value]);
                          }
                        }
                      }}
                    >
                      <Checkbox
                        isChecked={isSelectAll || selectedTags.includes(tag.value)}
                        mr={2}
                        onChange={(e) => {
                          e.stopPropagation();
                          if (isSelectAll) {
                            // 如果当前是全选状态，取消全选并只选择当前项
                            setSelectedTags([tag.value]);
                            setIsSelectAll(false);
                          } else {
                            // 正常的多选逻辑
                            if (selectedTags.includes(tag.value)) {
                              setSelectedTags(selectedTags.filter((t) => t !== tag.value));
                            } else {
                              setSelectedTags([...selectedTags, tag.value]);
                            }
                          }
                        }}
                      />
                      {tag.label}
                    </MenuItem>
                  ))}
                </MenuList>
              </Menu>
            </Box>
          </Flex>
          <Flex gap={3}>
            <Button
              colorScheme="blue"
              leftIcon={<MyIcon name="common/add2" w="14px" />}
              onClick={addAppModal.onOpen}
              minW="120px"
            >
              {t('common:add_app')}
            </Button>
            <Button
              variant="outline"
              leftIcon={<MyIcon name="common/settingLight" w="14px" />}
              onClick={tagModal.onOpen}
              minW="120px"
            >
              {t('common:tag_manage')}
            </Button>
          </Flex>
        </Flex>

        {/* 表头 */}
        <Flex
          bg="white"
          h={8}
          mt={5}
          pl={8}
          rounded="md"
          alignItems="center"
          fontSize="mini"
          fontWeight="medium"
        >
          <Box w="20%">
            <Flex alignItems="center" gap={2}>
              <Checkbox
                isChecked={selection.isAllSelected}
                isIndeterminate={selection.isIndeterminate}
                onChange={(e) => selection.handleSelectAll(e.target.checked)}
                size="sm"
              />
              {t('common:Name')}
            </Flex>
          </Box>
          <Box w="40%">{t('common:Intro')}</Box>
          <Box w="30%">{t('common:Tags')}</Box>
          <Box w="10%">{t('common:Action')}</Box>
        </Flex>

        {/* 应用列表 */}
        <Box overflow="auto" mt={4} maxH="calc(100vh - 200px)">
          {filteredApps.length > 0 ? (
            <DndDrag<AppListItemType> onDragEndCb={handleDragEnd} dataList={filteredApps}>
              {({ provided }) => (
                <Flex flexDirection="column" {...provided.droppableProps} ref={provided.innerRef}>
                  {filteredApps.map((app, index) => (
                    <AppRow
                      key={app._id}
                      app={app}
                      index={index}
                      tagMap={tagMap}
                      selectedAppIds={selection.selectedAppIds}
                      onAppSelect={selection.handleAppSelect}
                      onEdit={setEditingApp}
                      onDelete={(appId) => openConfirmDel(() => onDeleteApp(appId))()}
                    />
                  ))}
                  {provided.placeholder}
                </Flex>
              )}
            </DndDrag>
          ) : (
            <EmptyTip
              text={loading ? t('common:Loading') : t('common:no_matching_apps_found')}
              py={2}
            />
          )}
        </Box>

        {/* 模态框 */}
        {editingApp && (
          <GateAppInfoModal
            app={editingApp}
            onClose={() => setEditingApp(null)}
            onUpdateSuccess={refreshApps}
          />
        )}
        {tagModal.isOpen && <TagManageModal onClose={handleTagModalClose} />}
        {addAppModal.isOpen && (
          <AddFeatureAppModal
            isOpen={addAppModal.isOpen}
            onClose={addAppModal.onClose}
            onSuccess={handleAddAppSuccess}
          />
        )}
        <DelConfirmModal />
      </Flex>
    </MyBox>
  );
};

export default AppTable;
