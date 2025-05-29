import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Box,
  Button,
  Flex,
  Input,
  ModalBody,
  ModalFooter,
  useToast,
  HStack,
  IconButton,
  Container,
  Divider,
  Text,
  Checkbox
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import {
  getTeamTags,
  createTag,
  updateTag,
  deleteTag,
  batchAddTagsToApp,
  batchRemoveTagsFromApp,
  batchAddAppsToTag
} from '@/web/core/app/api/tags';
import type { TagWithCountType } from '@fastgpt/global/core/app/tags';
import MyIcon from '@fastgpt/web/components/common/Icon';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';
import SelectMultipleResource from './SelectMultipleResource';
import {
  type GetResourceFolderListProps,
  type GetResourceListItemResponse
} from '@fastgpt/global/common/parentFolder/type';
import { getMyApps } from '@/web/core/app/api';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import type { AppListItemType } from '@fastgpt/global/core/app/type.d';

interface TagManageModalProps {
  onClose: () => void;
  onTagsUpdated?: () => void;
}

type ViewMode = 'tagList' | 'appSelection';

const TagManageModal = ({ onClose, onTagsUpdated }: TagManageModalProps) => {
  const { t } = useTranslation();
  const toast = useToast();
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [editingTag, setEditingTag] = useState<{
    _id?: string;
    name: string;
  }>({ name: '' });
  const [isEditing, setIsEditing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('tagList');
  const [selectedTagForAddApps, setSelectedTagForAddApps] = useState<TagWithCountType | null>(null);
  const [searchKey, setSearchKey] = useState('');
  const [selectedAppIds, setSelectedAppIds] = useState<string[]>([]);
  const [allApps, setAllApps] = useState<AppListItemType[]>([]);
  const [initialAppsWithTag, setInitialAppsWithTag] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // 获取标签列表
  const { data: tags = [], loading: loadingTags } = useRequest2(
    async () => {
      const result = await getTeamTags(true);
      return result as TagWithCountType[];
    },
    {
      manual: false,
      refreshDeps: [refreshTrigger],
      onSuccess: (data) => {
        console.log('getTeamTags success', data);
      }
    }
  );

  // 创建标签
  const { runAsync: createTagMutate, loading: createLoading } = useRequest2(
    (data: { name: string }) => createTag(data),
    {
      onSuccess: () => {
        toast({
          title: '标签创建成功',
          status: 'success',
          duration: 3000,
          isClosable: true
        });
        setRefreshTrigger((prev) => prev + 1);
        setIsCreating(false);
        setEditingTag({ name: '' });
        onTagsUpdated?.();
      }
    }
  );

  // 更新标签
  const { runAsync: updateTagMutate, loading: updateLoading } = useRequest2(
    (data: { tagId: string; name: string }) => updateTag(data),
    {
      onSuccess: () => {
        toast({
          title: '标签更新成功',
          status: 'success',
          duration: 3000,
          isClosable: true
        });
        setRefreshTrigger((prev) => prev + 1);
        setIsEditing(false);
        setEditingTag({ name: '' });
        onTagsUpdated?.();
      }
    }
  );

  // 删除标签
  const { runAsync: deleteTagMutate, loading: deleteLoading } = useRequest2(
    (tagId: string) => deleteTag(tagId),
    {
      onSuccess: () => {
        toast({
          title: '标签删除成功',
          status: 'success',
          duration: 3000,
          isClosable: true
        });
        setRefreshTrigger((prev) => prev + 1);
        onTagsUpdated?.();
      }
    }
  );

  // 当创建或编辑模式激活时，聚焦输入框
  useEffect(() => {
    if ((isCreating || isEditing) && inputRef.current) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [isCreating, isEditing]);

  // 处理创建标签
  const handleCreateTag = () => {
    if (!editingTag.name.trim()) {
      toast({
        title: '标签名称不能为空',
        status: 'error',
        duration: 3000,
        isClosable: true
      });
      return;
    }

    createTagMutate({
      name: editingTag.name
    });
  };

  // 处理更新标签
  const handleUpdateTag = () => {
    if (!editingTag.name.trim()) {
      toast({
        title: '标签名称不能为空',
        status: 'error',
        duration: 3000,
        isClosable: true
      });
      return;
    }

    if (!editingTag._id) return;

    updateTagMutate({
      tagId: editingTag._id,
      name: editingTag.name
    });
  };

  // 处理删除标签
  const handleDeleteTag = (tagId: string) => {
    deleteTagMutate(tagId);
  };

  // 开始编辑标签
  const startEditTag = (tag: TagWithCountType) => {
    if (isEditing && editingTag._id === tag._id) {
      cancelEdit();
      return;
    }

    setEditingTag({
      _id: tag._id,
      name: tag.name
    });
    setIsEditing(true);
    setIsCreating(false);
  };

  // 开始创建新标签
  const startCreateTag = () => {
    setEditingTag({ name: '' });
    setIsCreating(true);
    setIsEditing(false);
  };

  // 取消编辑或创建
  const cancelEdit = () => {
    setIsEditing(false);
    setIsCreating(false);
    setEditingTag({ name: '' });
  };

  // 获取应用列表的函数
  const getAppList = useCallback(
    async ({ parentId }: GetResourceFolderListProps) => {
      const apps = await getMyApps({
        parentId,
        searchKey,
        type: [AppTypeEnum.folder, AppTypeEnum.simple, AppTypeEnum.workflow, AppTypeEnum.plugin]
      });

      // 保存所有应用数据，用于后续判断哪些应用已经有当前标签
      setAllApps(apps);

      // 如果是第一次加载（parentId 为 null）且有选中的标签，保存初始有标签的应用
      if (parentId === null && selectedTagForAddApps && initialAppsWithTag.length === 0) {
        const appsWithCurrentTag = apps
          .filter((app) => app.tags?.includes(selectedTagForAddApps._id))
          .map((app) => app._id);
        setInitialAppsWithTag(appsWithCurrentTag);
      }

      return apps.map<GetResourceListItemResponse>((item) => ({
        id: item._id,
        name: item.name,
        avatar: item.avatar,
        isFolder: item.type === AppTypeEnum.folder
      }));
    },
    [searchKey, selectedTagForAddApps, initialAppsWithTag.length]
  );

  // 处理应用选择
  const handleAppSelect = useCallback(
    (appId: string, appData: GetResourceListItemResponse) => {
      if (!selectedTagForAddApps) return;

      // 获取当前目录中有标签的应用
      const currentAppsWithTag = allApps
        .filter((app) => app.tags?.includes(selectedTagForAddApps._id))
        .map((app) => app._id);

      // 判断这个应用是否初始就被选中（包括初始有标签的 + 当前目录中有标签的）
      const allInitialSelected = [...new Set([...initialAppsWithTag, ...currentAppsWithTag])];
      const isInitiallySelected = allInitialSelected.includes(appId);
      const isCurrentlyInSelectedIds = selectedAppIds.includes(appId);

      setSelectedAppIds((prev) => {
        if (isInitiallySelected) {
          // 如果是初始就选中的应用
          if (isCurrentlyInSelectedIds) {
            // 当前在 selectedAppIds 中，移除它（表示取消选择）
            return prev.filter((id) => id !== appId);
          } else {
            // 当前不在 selectedAppIds 中，添加它（表示取消选择）
            return [...prev, appId];
          }
        } else {
          // 如果是初始没有选中的应用
          if (isCurrentlyInSelectedIds) {
            // 当前已选中，取消选择
            return prev.filter((id) => id !== appId);
          } else {
            // 当前未选中，添加选择
            return [...prev, appId];
          }
        }
      });
    },
    [selectedTagForAddApps, initialAppsWithTag, allApps, selectedAppIds]
  );

  // 获取当前选中的应用ID列表（包括已有标签的应用）
  const getSelectedIds = useCallback(() => {
    if (!selectedTagForAddApps) return [];

    // 获取当前目录中有标签的应用
    const currentAppsWithTag = allApps
      .filter((app) => app.tags?.includes(selectedTagForAddApps._id))
      .map((app) => app._id);

    // 合并：初始有标签的应用 + 当前目录中有标签的应用 + 用户手动选中的应用
    // 然后减去用户手动取消选择的应用
    const allInitialSelected = [...new Set([...initialAppsWithTag, ...currentAppsWithTag])];

    // 计算最终选中的应用：
    // 1. 从所有初始选中的应用开始
    // 2. 加上用户新选中的应用
    // 3. 减去用户取消选择的应用
    const finalSelected = new Set(allInitialSelected);

    // 处理用户的选择变更
    selectedAppIds.forEach((appId) => {
      if (allInitialSelected.includes(appId)) {
        // 如果这个应用初始是选中的，现在在 selectedAppIds 中表示用户取消了选择
        finalSelected.delete(appId);
      } else {
        // 如果这个应用初始不是选中的，现在在 selectedAppIds 中表示用户新选择了它
        finalSelected.add(appId);
      }
    });

    return Array.from(finalSelected);
  }, [selectedTagForAddApps, initialAppsWithTag, allApps, selectedAppIds]);

  // 批量更新应用标签
  const { runAsync: updateAppTags, loading: isUpdating } = useRequest2(
    async () => {
      if (!selectedTagForAddApps) return;

      // 直接使用 getSelectedIds 获取最终应该拥有该标签的应用列表
      const finalSelectedIds = getSelectedIds();

      // 使用新的批量添加应用到标签的 API 进行全量更新
      // 传入最终选中的所有应用 ID
      await batchAddAppsToTag(selectedTagForAddApps._id, finalSelectedIds);
    },
    {
      manual: true,
      onSuccess: () => {
        toast({
          title: '标签应用更新成功',
          status: 'success',
          duration: 3000,
          isClosable: true
        });
        setRefreshTrigger((prev) => prev + 1);
        onTagsUpdated?.();
        // 返回标签列表视图
        setViewMode('tagList');
        setSelectedTagForAddApps(null);
        setSelectedAppIds([]);
        setSearchKey('');
        setInitialAppsWithTag([]); // 清理初始应用列表
      },
      onError: (error) => {
        console.error('更新标签应用失败:', error);
        toast({
          title: '更新标签应用失败',
          status: 'error',
          duration: 3000,
          isClosable: true
        });
      }
    }
  );

  // 开始添加应用到标签
  const startAddAppsToTag = (tag: TagWithCountType) => {
    setSelectedTagForAddApps(tag);
    setViewMode('appSelection');
    setSelectedAppIds([]);
    setSearchKey('');
    setInitialAppsWithTag([]); // 重置初始应用列表，将在 getAppList 中重新设置
  };

  // 返回标签列表
  const backToTagList = () => {
    setViewMode('tagList');
    setSelectedTagForAddApps(null);
    setSelectedAppIds([]);
    setSearchKey('');
    setInitialAppsWithTag([]); // 清理初始应用列表
  };

  const isLoading = loadingTags || createLoading || updateLoading || deleteLoading;

  return (
    <MyModal
      isOpen
      onClose={onClose}
      iconSrc="/imgs/modal/tag.svg"
      title={viewMode === 'tagList' ? '分类管理' : `为标签"${selectedTagForAddApps?.name}"添加应用`}
      w="580px"
      maxW="100%"
      isLoading={isLoading || isUpdating}
    >
      <ModalBody px={9} py={6}>
        <Container maxW="100%" p={0}>
          {viewMode === 'tagList' ? (
            <>
              {/* 标签列表视图 */}
              {/* 头部区域 */}
              <Flex direction="column" gap={4} w="100%" h="40px" mb={4}>
                <Flex justifyContent="space-between" alignItems="center" w="100%" h="32px">
                  <Flex alignItems="center" gap={2}>
                    <MyIcon name="common/list" w="20px" h="20px" color="#111824" />
                    <Box
                      fontSize="16px"
                      fontWeight="500"
                      lineHeight="24px"
                      letterSpacing="0.15px"
                      color="#111824"
                    >
                      共 {tags.length} 个分类
                    </Box>
                  </Flex>
                  <Button
                    leftIcon={<MyIcon name="common/addLight" w="16px" h="16px" color="#485264" />}
                    onClick={startCreateTag}
                    size="sm"
                    variant="outline"
                    bg="white"
                    border="1px solid #DFE2EA"
                    boxShadow="0px 1px 2px rgba(19, 51, 107, 0.05), 0px 0px 1px rgba(19, 51, 107, 0.08)"
                    borderRadius="6px"
                    h="32px"
                    px="14px"
                    fontSize="12px"
                    fontWeight="500"
                    lineHeight="16px"
                    letterSpacing="0.5px"
                    color="#485264"
                    isDisabled={isCreating}
                    _hover={{
                      bg: 'gray.50'
                    }}
                  >
                    新建
                  </Button>
                </Flex>
                <Divider borderColor="#E8EBF0" />
              </Flex>

              {/* 标签列表区域 */}
              <Flex direction="column" gap={2} w="100%" maxH="304px" overflowY="auto">
                {/* 创建新标签表单 */}
                {isCreating && (
                  <Flex
                    alignItems="center"
                    p="4px 8px"
                    gap={2}
                    w="100%"
                    h="36px"
                    borderRadius="4px"
                    bg="transparent"
                  >
                    <Flex alignItems="center" gap={2} w="195px" h="28px">
                      <Box
                        position="relative"
                        w="168px"
                        h="28px"
                        bg="white"
                        border="1px solid #3370FF"
                        boxShadow="0px 0px 0px 2.4px rgba(51, 112, 255, 0.15)"
                        borderRadius="4px"
                      >
                        <Input
                          ref={inputRef}
                          value={editingTag.name}
                          onChange={(e) => setEditingTag({ ...editingTag, name: e.target.value })}
                          placeholder="新建分类"
                          maxLength={20}
                          bg="transparent"
                          border="none"
                          h="100%"
                          w="100%"
                          px="8px"
                          fontSize="12px"
                          fontWeight="400"
                          lineHeight="16px"
                          letterSpacing="0.004em"
                          color="#111824"
                          _focus={{ boxShadow: 'none' }}
                          _placeholder={{ color: '#667085' }}
                        />
                      </Box>
                      <Box
                        fontSize="14px"
                        fontWeight="400"
                        lineHeight="20px"
                        letterSpacing="0.25px"
                        color="#667085"
                      >
                        (0)
                      </Box>
                    </Flex>
                  </Flex>
                )}

                {/* 标签列表 */}
                {(tags as TagWithCountType[]).map((tag, index) => (
                  <React.Fragment key={tag._id}>
                    {isEditing && editingTag._id === tag._id ? (
                      // 编辑模式
                      <Flex
                        alignItems="center"
                        p="4px 8px"
                        gap={2}
                        w="100%"
                        h="36px"
                        borderRadius="4px"
                        bg="transparent"
                      >
                        <Flex alignItems="center" gap={2} w="195px" h="28px">
                          <Box
                            position="relative"
                            w="168px"
                            h="28px"
                            bg="white"
                            border="1px solid #3370FF"
                            boxShadow="0px 0px 0px 2.4px rgba(51, 112, 255, 0.15)"
                            borderRadius="4px"
                          >
                            <Input
                              ref={inputRef}
                              value={editingTag.name}
                              onChange={(e) =>
                                setEditingTag({ ...editingTag, name: e.target.value })
                              }
                              maxLength={20}
                              bg="transparent"
                              border="none"
                              h="100%"
                              w="100%"
                              px="8px"
                              fontSize="12px"
                              fontWeight="400"
                              lineHeight="16px"
                              letterSpacing="0.004em"
                              color="#111824"
                              _focus={{ boxShadow: 'none' }}
                              _placeholder={{ color: '#667085' }}
                            />
                          </Box>
                          <Box
                            fontSize="14px"
                            fontWeight="400"
                            lineHeight="20px"
                            letterSpacing="0.25px"
                            color="#667085"
                          >
                            ({tag.count || 0})
                          </Box>
                        </Flex>
                      </Flex>
                    ) : (
                      // 普通显示模式
                      <Flex
                        alignItems="center"
                        p="4px 8px"
                        gap={2}
                        w="100%"
                        h="36px"
                        borderRadius="4px"
                        bg="transparent"
                        _hover={{ bg: '#F9F9F9' }}
                      >
                        <Flex alignItems="center" gap={2} flex={1}>
                          <Flex
                            justifyContent="center"
                            alignItems="center"
                            p="10px 8px"
                            h="28px"
                            bg="#F4F4F5"
                            borderRadius="6px"
                            minW="fit-content"
                          >
                            <Box
                              fontSize="12px"
                              fontWeight="500"
                              lineHeight="16px"
                              color="#525252"
                              whiteSpace="nowrap"
                            >
                              {tag.name}
                            </Box>
                          </Flex>
                          <Box fontSize="14px" color="#667085">
                            ({tag.count || 0})
                          </Box>
                        </Flex>

                        <Flex alignItems="center" gap={2}>
                          <IconButton
                            aria-label="添加"
                            icon={
                              <MyIcon name="common/addLight" w="16px" h="16px" color="#485264" />
                            }
                            size="sm"
                            variant="ghost"
                            w="24px"
                            h="24px"
                            borderRadius="6px"
                            onClick={() => startAddAppsToTag(tag)}
                            isDisabled={isCreating}
                          />
                          <IconButton
                            aria-label="编辑"
                            icon={<MyIcon name="edit" w="16px" h="16px" color="#485264" />}
                            size="sm"
                            variant="ghost"
                            w="24px"
                            h="24px"
                            borderRadius="6px"
                            onClick={() => startEditTag(tag)}
                            isDisabled={isCreating}
                          />
                          <IconButton
                            aria-label="删除"
                            icon={<MyIcon name="delete" w="16px" h="16px" color="#485264" />}
                            size="sm"
                            variant="ghost"
                            w="24px"
                            h="24px"
                            borderRadius="6px"
                            onClick={() => handleDeleteTag(tag._id)}
                            isDisabled={isCreating}
                          />
                        </Flex>
                      </Flex>
                    )}
                    {index < tags.length - 1 && <Divider borderColor="#E8EBF0" />}
                  </React.Fragment>
                ))}

                {tags.length === 0 && !loadingTags && (
                  <Flex
                    justifyContent="center"
                    alignItems="center"
                    h="100px"
                    color="gray.500"
                    fontSize="14px"
                  >
                    暂无标签
                  </Flex>
                )}
              </Flex>
            </>
          ) : (
            <>
              {/* 应用选择视图 */}
              <Flex direction="column" h="500px" gap={4}>
                {/* 头部区域 */}
                <Flex direction="column" gap={4} w="100%" h="46px">
                  <Flex justifyContent="space-between" alignItems="center" w="100%" h="38px">
                    <Flex alignItems="center" gap={3}>
                      <IconButton
                        aria-label="返回"
                        icon={
                          <MyIcon name="common/leftArrowLight" w="18px" h="18px" color="#485264" />
                        }
                        size="sm"
                        variant="ghost"
                        w="32px"
                        h="32px"
                        borderRadius="6px"
                        onClick={backToTagList}
                        _hover={{
                          bg: 'rgba(31, 35, 41, 0.08)'
                        }}
                      />
                      <Flex alignItems="center" gap={2}>
                        <Flex
                          justifyContent="center"
                          alignItems="center"
                          px="8px"
                          py="6px"
                          h="28px"
                          bg="#F4F4F5"
                          borderRadius="6px"
                          minW="fit-content"
                        >
                          <Box
                            fontSize="12px"
                            fontWeight="500"
                            lineHeight="16px"
                            color="#525252"
                            whiteSpace="nowrap"
                          >
                            {selectedTagForAddApps?.name}
                          </Box>
                        </Flex>
                        <Box
                          fontSize="14px"
                          fontWeight="400"
                          lineHeight="20px"
                          letterSpacing="0.25px"
                          color="#667085"
                        >
                          ({selectedTagForAddApps?.count || 0})
                        </Box>
                      </Flex>
                    </Flex>
                    <Flex alignItems="center" gap={2}>
                      <Box w="200px" h="32px">
                        <SearchInput
                          value={searchKey}
                          onChange={(e) => setSearchKey(e.target.value)}
                          placeholder="搜索"
                          bg="#F7F8FA"
                          border="1px solid #E8EBF0"
                          borderRadius="6px"
                          h="32px"
                          fontSize="12px"
                        />
                      </Box>
                      <Button
                        leftIcon={<MyIcon name="save" w="16px" h="16px" color="#FFFFFF" />}
                        onClick={() => updateAppTags()}
                        size="sm"
                        bg="#3370FF"
                        color="white"
                        boxShadow="0px 1px 2px rgba(19, 51, 107, 0.05), 0px 0px 1px rgba(19, 51, 107, 0.08)"
                        borderRadius="6px"
                        h="32px"
                        px="14px"
                        fontSize="12px"
                        fontWeight="500"
                        lineHeight="16px"
                        letterSpacing="0.5px"
                        isLoading={isUpdating}
                        _hover={{
                          bg: '#2C5CE6'
                        }}
                      >
                        保存
                      </Button>
                    </Flex>
                  </Flex>
                  <Divider borderColor="#E8EBF0" />
                </Flex>

                {/* 应用选择区域 */}
                <Box flex={1} overflow="auto" w="100%" maxH="400px">
                  <SelectMultipleResource
                    selectedIds={getSelectedIds()}
                    onSelect={handleAppSelect}
                    server={getAppList}
                    searchKey={searchKey}
                    maxH="400px"
                  />
                </Box>
              </Flex>
            </>
          )}
        </Container>
      </ModalBody>

      <ModalFooter borderTopWidth="1px" py={4}>
        <Flex gap={3}>
          {(isCreating || isEditing) && viewMode === 'tagList' && (
            <>
              <Button variant="outline" size="sm" onClick={cancelEdit}>
                取消
              </Button>
              <Button
                colorScheme="blue"
                size="sm"
                onClick={isCreating ? handleCreateTag : handleUpdateTag}
              >
                {isCreating ? '创建' : '保存'}
              </Button>
            </>
          )}
          {!isCreating && !isEditing && viewMode === 'tagList' && (
            <Button onClick={onClose}>关闭</Button>
          )}
          {viewMode === 'appSelection' && <Button onClick={backToTagList}>关闭</Button>}
        </Flex>
      </ModalFooter>
    </MyModal>
  );
};

export default TagManageModal;
