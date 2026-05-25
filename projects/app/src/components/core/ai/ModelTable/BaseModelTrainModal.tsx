import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  Box,
  Button,
  Checkbox,
  Flex,
  Grid,
  IconButton,
  Input,
  ModalBody,
  ModalFooter,
  VStack
} from '@chakra-ui/react';
import { ChevronRightIcon, ChevronDownIcon, CloseIcon } from '@chakra-ui/icons';
import { useTranslation } from 'next-i18next';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/model';
import dynamic from 'next/dynamic';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';
import Avatar from '@fastgpt/web/components/common/Avatar';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import type { SelectedDatasetType } from '@fastgpt/global/core/workflow/type/io';
import type { DatasetListItemType } from '@fastgpt/global/core/dataset/type';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { createEmbeddingTrainTask, createRerankTrainTask } from '@/web/core/app/api/train';
import { getDatasetsWithChildren } from '@/web/core/dataset/api';

const MyModal = dynamic(() => import('@fastgpt/web/components/common/MyModal'));

export type BaseModelTrainDefaultBaseModel = {
  type: ModelTypeEnum.rerank | ModelTypeEnum.embedding;
  model: string;
};

type BaseModelTrainModalProps = {
  onClose: () => void;
  defaultBaseModel?: BaseModelTrainDefaultBaseModel;
  onSuccess?: () => void;
};

type DatasetTreeItem = DatasetListItemType & {
  children?: DatasetTreeItem[];
};

type TreeNode = {
  item: DatasetTreeItem;
  id: string;
  level: number;
  isFolder: boolean;
  childrenIds: string[];
};

type VisibleTreeNode = TreeNode & {
  hasMatchedDescendant: boolean;
};

const labelStyles = {
  fontSize: 'sm' as const,
  color: 'myGray.900',
  mb: 1,
  fontWeight: 'medium' as const
};

const toSelectedDataset = (item: DatasetListItemType): SelectedDatasetType => ({
  datasetId: item._id,
  avatar: item.avatar,
  name: item.name,
  vectorModel: item.vectorModel,
  datasetType: item.type,
  dataCount: item.dataCount
});

const BaseModelTrainModal = ({
  onClose,
  defaultBaseModel,
  onSuccess
}: BaseModelTrainModalProps) => {
  const { t } = useTranslation();
  const { embeddingModelList, reRankModelList } = useSystemStore();

  const baseModelType = useMemo<ModelTypeEnum.rerank | ModelTypeEnum.embedding | ''>(
    () => defaultBaseModel?.type ?? ModelTypeEnum.rerank,
    [defaultBaseModel]
  );
  const selectedBaseModel = useMemo(() => defaultBaseModel?.model ?? '', [defaultBaseModel]);
  const [modelName, setModelName] = useState('');
  const hasAutoFilledRef = useRef(false);

  // 可选基座模型列表：排除已微调过的（isTuned）和不支持训练的（supportTrain）
  const availableBaseModelList = useMemo(
    () => ({
      rerank: reRankModelList.filter((item) => item.isTuned !== true && item.supportTrain),
      embedding: embeddingModelList.filter((item) => item.isTuned !== true && item.supportTrain)
    }),
    [reRankModelList, embeddingModelList]
  );

  // 自动生成模型名称：基座模型名 + 日期 + 随机数，仅首次填入
  useEffect(() => {
    if (hasAutoFilledRef.current || !defaultBaseModel?.model) return;
    hasAutoFilledRef.current = true;
    const allModels = [...availableBaseModelList.rerank, ...availableBaseModelList.embedding];
    const found = allModels.find((m) => m.model === defaultBaseModel.model);
    if (found) {
      const now = new Date();
      const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
      const randomNum = Math.floor(Math.random() * 900 + 100).toString();
      setModelName(`${found.name}-${dateStr}-${randomNum}`);
    }
  }, [defaultBaseModel, availableBaseModelList]);

  const [selectedDatasets, setSelectedDatasets] = useState<SelectedDatasetType[]>([]);
  // 选中的空文件夹 ID 集合——空文件夹没有叶子节点，单独追踪
  const [selectedEmptyFolderIds, setSelectedEmptyFolderIds] = useState<Set<string>>(new Set());
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(new Set());
  const [searchKey, setSearchKey] = useState('');

  const { data: datasetTree = [], loading: isFetching } = useRequest(
    async () => {
      const res = await getDatasetsWithChildren({
        parentId: null
      });
      return res;
    },
    {
      manual: false,
      errorToast: t('app:operation_failed')
    }
  );

  // 构建整棵知识库树的状态快照，遍历一次后缓存所有查询路径
  // 产物：nodeMap（id→节点）、leafDescendantMap（文件夹id→所有后代叶子）、allLeafItems、emptyFolderIds
  const treeState = useMemo(() => {
    const nodeMap = new Map<string, TreeNode>();
    const leafDescendantMap = new Map<string, DatasetListItemType[]>();
    const rootIds: string[] = [];
    const allLeafItems: DatasetListItemType[] = [];
    const emptyFolderIds = new Set<string>();

    const build = (items: DatasetTreeItem[], level: number, isRoot = false) => {
      items.forEach((item) => {
        const id = String(item._id);
        const childIds = (item.children || []).map((child) => String(child._id));
        const node: TreeNode = {
          item,
          id,
          level,
          isFolder: item.type === DatasetTypeEnum.folder,
          childrenIds: childIds
        };

        nodeMap.set(id, node);
        if (isRoot) {
          rootIds.push(id);
        }

        if (item.children?.length) {
          build(item.children, level + 1);
        }
      });
    };

    const collectLeaves = (nodeId: string): DatasetListItemType[] => {
      const node = nodeMap.get(nodeId);
      if (!node) return [];

      if (!node.isFolder) {
        allLeafItems.push(node.item);
        const leaves = [node.item];
        leafDescendantMap.set(nodeId, leaves);
        return leaves;
      }

      const leaves = node.childrenIds.flatMap((childId) => collectLeaves(childId));
      leafDescendantMap.set(nodeId, leaves);
      if (leaves.length === 0) {
        emptyFolderIds.add(nodeId);
      }
      return leaves;
    };

    build(datasetTree, 0, true);
    rootIds.forEach((id) => collectLeaves(id));

    return {
      nodeMap,
      leafDescendantMap,
      rootIds,
      allLeafItems,
      emptyFolderIds
    };
  }, [datasetTree]);

  const selectedDatasetIdSet = useMemo(
    () => new Set(selectedDatasets.map((item) => item.datasetId)),
    [selectedDatasets]
  );

  // 搜索匹配状态：关键词为空时全部匹配；有词时 DFS 向上传播——子节点匹配则父节点也算匹配
  const matchedState = useMemo(() => {
    const keyword = searchKey.trim().toLowerCase();
    const directMatchMap = new Map<string, boolean>();
    const hasMatchedDescendantMap = new Map<string, boolean>();

    treeState.nodeMap.forEach((node, id) => {
      const matched =
        !keyword ||
        node.item.name.toLowerCase().includes(keyword) ||
        node.item.intro?.toLowerCase().includes(keyword);
      directMatchMap.set(id, matched);
    });

    const dfs = (nodeId: string): boolean => {
      const node = treeState.nodeMap.get(nodeId);
      if (!node) return false;

      const childMatched = node.childrenIds.some((childId) => dfs(childId));
      const matched = !!directMatchMap.get(nodeId) || childMatched;
      hasMatchedDescendantMap.set(nodeId, matched);
      return matched;
    };

    treeState.rootIds.forEach((id) => dfs(id));

    return {
      keyword,
      hasMatchedDescendantMap
    };
  }, [searchKey, treeState]);

  // 确定最终可见的树节点：搜索模式下无视折叠状态全部展开，普通模式下跟随 expandedFolderIds
  const visibleNodes = useMemo(() => {
    const result: VisibleTreeNode[] = [];

    const walk = (nodeId: string) => {
      const node = treeState.nodeMap.get(nodeId);
      if (!node) return;

      const hasMatchedDescendant = matchedState.hasMatchedDescendantMap.get(nodeId) ?? false;
      if (matchedState.keyword && !hasMatchedDescendant) return;

      result.push({
        ...node,
        hasMatchedDescendant
      });

      const shouldExpandForSearch = !!matchedState.keyword;
      const isExpanded = shouldExpandForSearch || expandedFolderIds.has(nodeId);

      if (node.isFolder && isExpanded) {
        node.childrenIds.forEach((childId) => walk(childId));
      }
    };

    treeState.rootIds.forEach((id) => walk(id));

    return result;
  }, [expandedFolderIds, matchedState, treeState]);

  // embedding 训练时，知识库的向量模型必须与所选基座模型一致，否则不可选
  // rerank 训练时所有知识库均可选（rerank 不依赖向量）
  const isDatasetDisabled = useCallback(
    (item: DatasetListItemType) => {
      if (baseModelType !== ModelTypeEnum.embedding) return false;
      return item.vectorModel?.model !== selectedBaseModel;
    },
    [baseModelType, selectedBaseModel]
  );

  // 合并两种禁用条件：正在处理中 或 向量模型不兼容
  const isItemDisabled = useCallback(
    (item: DatasetListItemType) => {
      return isDatasetDisabled(item) || (item.processingCount ?? 0) > 0;
    },
    [isDatasetDisabled]
  );

  // 文件夹选择状态：全选/半选/未选
  // 只根据可选项（未被 disabled）计算比例，避免已禁用的知识库干扰全选状态
  const getFolderCheckState = useCallback(
    (folderId: string) => {
      const leafItems = treeState.leafDescendantMap.get(folderId) || [];
      const selectableItems = leafItems.filter((item) => !isItemDisabled(item));

      // 文件夹下无数据（纯空文件夹）→ 用 emptyFolderIds 追踪选中状态
      if (leafItems.length === 0) {
        return {
          isChecked: selectedEmptyFolderIds.has(folderId),
          isIndeterminate: false
        };
      }

      // 有数据但全部被 disable 了 → 不可交互
      if (selectableItems.length === 0) {
        return { isChecked: false, isIndeterminate: false };
      }

      const selectedCount = selectableItems.reduce(
        (count, item) => count + (selectedDatasetIdSet.has(item._id) ? 1 : 0),
        0
      );

      return {
        isChecked: selectedCount === selectableItems.length,
        isIndeterminate: selectedCount > 0 && selectedCount < selectableItems.length
      };
    },
    [selectedDatasetIdSet, selectedEmptyFolderIds, treeState.leafDescendantMap, isItemDisabled]
  );

  const toggleFolderSelection = useCallback(
    (folderId: string, checked: boolean) => {
      const leafItems = treeState.leafDescendantMap.get(folderId) || [];
      const enabledLeafItems = leafItems.filter((item) => !isItemDisabled(item));

      if (enabledLeafItems.length === 0) {
        // 文件夹下无数据（纯空文件夹）→ 用 emptyFolderIds 追踪选中状态
        if (leafItems.length === 0) {
          setSelectedEmptyFolderIds((prev) => {
            const next = new Set(prev);
            if (checked) {
              next.add(folderId);
            } else {
              next.delete(folderId);
            }
            return next;
          });
        }
        return;
      }

      const enabledLeafIdSet = new Set(enabledLeafItems.map((item) => item._id));
      setSelectedDatasets((prev) => {
        if (checked) {
          const existedIds = new Set(prev.map((item) => item.datasetId));
          const additions = enabledLeafItems
            .filter((item) => !existedIds.has(item._id))
            .map((item) => toSelectedDataset(item));
          return [...prev, ...additions];
        }
        return prev.filter((item) => !enabledLeafIdSet.has(item.datasetId));
      });
    },
    [treeState.leafDescendantMap, isItemDisabled]
  );

  const onSelectDataset = useCallback((item: DatasetListItemType, checked: boolean) => {
    if (checked) {
      setSelectedDatasets((prev) => {
        if (prev.some((dataset) => dataset.datasetId === item._id)) {
          return prev;
        }
        return [...prev, toSelectedDataset(item)];
      });
    } else {
      setSelectedDatasets((prev) => prev.filter((d) => d.datasetId !== item._id));
    }
  }, []);

  // 全选判断：只检查可选项（未 disabled 的叶子 + 空文件夹）是否全部被选中
  const isAllSelected = useMemo(() => {
    const selectableLeafItems = treeState.allLeafItems.filter((item) => !isItemDisabled(item));
    if (selectableLeafItems.length === 0 && treeState.emptyFolderIds.size === 0) return false;

    const allLeavesSelected = selectableLeafItems.every((item) =>
      selectedDatasetIdSet.has(item._id)
    );
    const allEmptyFoldersSelected = [...treeState.emptyFolderIds].every((id) =>
      selectedEmptyFolderIds.has(id)
    );

    return allLeavesSelected && allEmptyFoldersSelected;
  }, [selectedDatasetIdSet, selectedEmptyFolderIds, treeState, isItemDisabled]);

  const handleSelectAll = useCallback(
    (checked: boolean) => {
      if (checked) {
        const selectableLeafItems = treeState.allLeafItems.filter((item) => !isItemDisabled(item));
        setSelectedDatasets(selectableLeafItems.map(toSelectedDataset));
        setSelectedEmptyFolderIds(new Set(treeState.emptyFolderIds));
      } else {
        setSelectedDatasets([]);
        setSelectedEmptyFolderIds(new Set());
      }
    },
    [treeState, isItemDisabled]
  );

  const { runAsync: submitTrainTask, loading: isSubmitting } = useRequest(
    async () => {
      const data = {
        baseModelId: selectedBaseModel,
        datasetIds: selectedDatasets.map((item) => item.datasetId),
        newModelName: modelName.trim()
      };

      if (baseModelType === ModelTypeEnum.embedding) {
        return createEmbeddingTrainTask(data);
      }

      return createRerankTrainTask(data);
    },
    {
      manual: true,
      errorToast: t('app:operation_failed'),
      successToast: t('app:operation_success'),
      onSuccess: () => {
        onSuccess?.();
        onClose();
      }
    }
  );

  const handleConfirm = useCallback(() => {
    submitTrainTask();
  }, [submitTrainTask]);

  return (
    <MyModal
      isOpen
      onClose={onClose}
      title={t('account_model:train_model_generate_new')}
      w={'720px'}
      maxW={'720px'}
      h={'90vh'}
      maxH={'750px'}
      isCentered
      isLoading={isFetching}
    >
      <ModalBody flex={1} h={0} overflowY={'auto'} display={'flex'} flexDirection={'column'}>
        <Box mb={4}>
          <Flex {...labelStyles} alignItems={'center'}>
            <Box mr={0.5} color={'red.500'}>
              *
            </Box>
            <Box>{t('account_model:train_new_model_name')}</Box>
          </Flex>
          <Input
            value={modelName}
            onChange={(e) => {
              setModelName(e.target.value);
            }}
          />
        </Box>

        <Box flex={1} display={'flex'} flexDirection={'column'} minH={0}>
          <Flex {...labelStyles} alignItems={'center'}>
            <Box mr={0.5} color={'red.500'}>
              *
            </Box>
            <Box>{t('account_model:train_data')}</Box>
          </Flex>
          <Grid
            border={'1px solid'}
            borderColor={'myGray.200'}
            borderRadius={'md'}
            gridTemplateColumns={'1fr 1fr'}
            flex={1}
            minH={'260px'}
            overflow={'hidden'}
          >
            <Flex
              h={'100%'}
              direction={'column'}
              borderRight={'1px solid'}
              borderColor={'myGray.200'}
              py={3}
              overflow={'hidden'}
            >
              <Box mb={2} px={3}>
                <SearchInput
                  placeholder={t('app:Search_dataset')}
                  value={searchKey}
                  onChange={(e) => setSearchKey(e.target.value?.trim())}
                  size={'md'}
                />
              </Box>
              <Box
                mb={1}
                py={0.5}
                px={3}
                fontSize={'sm'}
                minH={7}
                display={'flex'}
                alignItems={'center'}
                color={'myGray.500'}
              >
                {searchKey ? t('chat:search_results') : t('common:root_folder')}
              </Box>
              <VStack
                align={'stretch'}
                spacing={1}
                flex={1}
                px={3}
                overflowY={'auto'}
                h={0}
                minH={0}
              >
                {visibleNodes.length === 0 && !isFetching && (
                  <EmptyTip text={t('common:folder.empty')} />
                )}
                {visibleNodes.map((node) => {
                  const { item, id, level, isFolder, childrenIds } = node;
                  // 两种禁用条件的优先级：处理中 > 向量模型不匹配
                  // 分别对应不同的 Tooltip 文案
                  const isProcessing = !isFolder && (item.processingCount ?? 0) > 0;
                  const isModelMismatch = !isFolder && isDatasetDisabled(item);
                  const isDisabled = isProcessing || isModelMismatch;
                  const disabledTooltip = isProcessing
                    ? t('account_model:dataset_still_processing_tip')
                    : isModelMismatch
                      ? t('account_model:train_dataset_vector_model_mismatch')
                      : undefined;
                  const folderCheckState = isFolder
                    ? getFolderCheckState(id)
                    : {
                        isChecked: selectedDatasetIdSet.has(id),
                        isIndeterminate: false
                      };
                  const isExpanded = searchKey ? true : expandedFolderIds.has(id);

                  return (
                    <Box key={id} userSelect={'none'}>
                      <Flex
                        align={'center'}
                        pr={2}
                        pl={3 + level * 20}
                        py={1.5}
                        borderRadius={'md'}
                        _hover={{ bg: isDisabled ? undefined : 'myGray.50' }}
                        cursor={isDisabled ? 'not-allowed' : 'pointer'}
                        opacity={isDisabled ? 0.5 : 1}
                        onClick={() => {
                          if (isDisabled) return;
                          if (isFolder) {
                            if (!searchKey) {
                              setExpandedFolderIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(id)) {
                                  next.delete(id);
                                } else {
                                  next.add(id);
                                }
                                return next;
                              });
                            }
                            return;
                          }
                          onSelectDataset(item, !selectedDatasetIdSet.has(id));
                        }}
                      >
                        <MyTooltip label={disabledTooltip}>
                          <Box
                            w={5}
                            onClick={(e) => {
                              e.stopPropagation();
                            }}
                          >
                            <Checkbox
                              isChecked={folderCheckState.isChecked}
                              isIndeterminate={folderCheckState.isIndeterminate}
                              isDisabled={isDisabled}
                              onChange={(e) => {
                                if (isDisabled) return;
                                if (isFolder) {
                                  toggleFolderSelection(id, e.target.checked);
                                } else {
                                  onSelectDataset(item, e.target.checked);
                                }
                              }}
                              colorScheme={'blue'}
                              size={'sm'}
                            />
                          </Box>
                        </MyTooltip>
                        <Avatar src={item.avatar} w={7} h={7} borderRadius={'sm'} ml={2} mr={2.5} />
                        <Box flex={1} minW={0}>
                          <Box fontSize={'sm'} color={'myGray.900'} lineHeight={1}>
                            {item.name}
                          </Box>
                          <Box fontSize={'xs'} color={'myGray.500'} mt={0.5}>
                            {isFolder ? t('common:Folder') : item.vectorModel?.name}
                          </Box>
                        </Box>
                        {isFolder && childrenIds.length > 0 && (
                          <Box
                            display={'flex'}
                            alignItems={'center'}
                            justifyContent={'center'}
                            color={'myGray.500'}
                          >
                            {isExpanded ? (
                              <ChevronDownIcon w={5} h={5} />
                            ) : (
                              <ChevronRightIcon w={5} h={5} />
                            )}
                          </Box>
                        )}
                      </Flex>
                    </Box>
                  );
                })}
              </VStack>
              {datasetTree.length > 0 && (
                <Flex mt={2} px={3} align={'center'}>
                  <Checkbox
                    isChecked={isAllSelected}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    colorScheme={'blue'}
                    size={'sm'}
                  >
                    <Box fontSize={'sm'}>{t('common:Select_all')}</Box>
                  </Checkbox>
                </Flex>
              )}
            </Flex>

            <Flex h={'100%'} py={3} direction={'column'} overflow={'hidden'} minH={0}>
              <Box mb={2} px={4} fontSize={'sm'} color={'myGray.600'}>
                {t('app:Selected')}: {selectedDatasets.length}
              </Box>
              <VStack
                align={'stretch'}
                overflowY={'auto'}
                spacing={1}
                flex={1}
                px={4}
                h={0}
                minH={0}
              >
                {selectedDatasets.length === 0 && <EmptyTip text={t('app:No_selected_dataset')} />}
                {selectedDatasets.map((item) => (
                  <Flex
                    key={item.datasetId}
                    px={2}
                    py={1.5}
                    borderRadius={'md'}
                    _hover={{ bg: 'myGray.50' }}
                    alignItems={'center'}
                  >
                    <Avatar src={item.avatar} w={6} h={6} borderRadius={'sm'} mr={3} />
                    <Box flex={1} minW={0}>
                      <Box fontSize={'sm'} className={'textEllipsis'}>
                        {item.name}
                      </Box>
                    </Box>
                    <IconButton
                      aria-label={'Remove'}
                      icon={<CloseIcon w={2.5} h={2.5} />}
                      size={'xs'}
                      variant={'ghost'}
                      _hover={{ bg: 'myGray.200' }}
                      onClick={() =>
                        setSelectedDatasets((prev) =>
                          prev.filter((d) => d.datasetId !== item.datasetId)
                        )
                      }
                    />
                  </Flex>
                ))}
              </VStack>
            </Flex>
          </Grid>
        </Box>
      </ModalBody>

      <ModalFooter>
        <Button variant={'whiteBase'} mr={3} onClick={onClose}>
          {t('common:Cancel')}
        </Button>
        <Button
          isDisabled={!modelName.trim() || selectedDatasets.length === 0}
          isLoading={isSubmitting}
          onClick={handleConfirm}
        >
          {t('common:Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default BaseModelTrainModal;
