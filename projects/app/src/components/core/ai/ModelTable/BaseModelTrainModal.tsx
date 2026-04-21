import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  Box,
  Button,
  Checkbox,
  Flex,
  Grid,
  HStack,
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
import MySelect from '@fastgpt/web/components/common/MySelect';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';
import Avatar from '@fastgpt/web/components/common/Avatar';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
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

  const baseModelTypeOptions = useMemo(
    () => [
      { label: t('common:model.type.reRank'), value: ModelTypeEnum.rerank },
      { label: t('common:model.type.embedding'), value: ModelTypeEnum.embedding }
    ],
    [t]
  );

  const [baseModelType, setBaseModelType] = useState<
    ModelTypeEnum.rerank | ModelTypeEnum.embedding | ''
  >(defaultBaseModel?.type ?? ModelTypeEnum.rerank);
  const [selectedBaseModel, setSelectedBaseModel] = useState<string>(defaultBaseModel?.model ?? '');
  const [modelName, setModelName] = useState('');
  const isModelNameManuallyEdited = useRef(false);
  const [selectedDatasets, setSelectedDatasets] = useState<SelectedDatasetType[]>([]);
  const [selectedEmptyFolderIds, setSelectedEmptyFolderIds] = useState<Set<string>>(new Set());
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(new Set());
  const [searchKey, setSearchKey] = useState('');
  const hasInitializedSelectionRef = useRef(false);

  const availableBaseModelList = useMemo(
    () => ({
      rerank: reRankModelList.filter((item) => item.isTuned !== true),
      embedding: embeddingModelList.filter((item) => item.isTuned !== true)
    }),
    [reRankModelList, embeddingModelList]
  );

  const modelOptions = useMemo(() => {
    if (baseModelType === ModelTypeEnum.rerank) {
      return availableBaseModelList.rerank.map((item) => ({ label: item.name, value: item.model }));
    }
    if (baseModelType === ModelTypeEnum.embedding) {
      return availableBaseModelList.embedding.map((item) => ({
        label: item.name,
        value: item.model
      }));
    }
    return [];
  }, [baseModelType, availableBaseModelList]);

  const autoFillModelName = useCallback(
    (modelId: string) => {
      if (isModelNameManuallyEdited.current) return;
      const allModels = [...availableBaseModelList.rerank, ...availableBaseModelList.embedding];
      const found = allModels.find((m) => m.model === modelId);
      if (found) {
        const now = new Date();
        const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
        const randomNum = Math.floor(Math.random() * 900 + 100).toString();
        setModelName(`${found.name}-${dateStr}-${randomNum}`);
      }
    },
    [availableBaseModelList]
  );

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

  useEffect(() => {
    if (hasInitializedSelectionRef.current || datasetTree.length === 0) return;

    setSelectedDatasets(treeState.allLeafItems.map(toSelectedDataset));
    setSelectedEmptyFolderIds(new Set(treeState.emptyFolderIds));
    hasInitializedSelectionRef.current = true;
  }, [datasetTree, treeState]);

  useEffect(() => {
    if (defaultBaseModel?.model) {
      autoFillModelName(defaultBaseModel.model);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const handleBaseModelTypeChange = useCallback((type: string) => {
    setBaseModelType(type as ModelTypeEnum.rerank | ModelTypeEnum.embedding);
    setSelectedBaseModel('');
  }, []);

  const handleBaseModelChange = useCallback(
    (model: string) => {
      setSelectedBaseModel(model);
      autoFillModelName(model);
    },
    [autoFillModelName]
  );

  const getFolderCheckState = useCallback(
    (folderId: string) => {
      const leafItems = treeState.leafDescendantMap.get(folderId) || [];
      if (leafItems.length === 0) {
        return {
          isChecked: selectedEmptyFolderIds.has(folderId),
          isIndeterminate: false
        };
      }

      const selectedCount = leafItems.reduce(
        (count, item) => count + (selectedDatasetIdSet.has(item._id) ? 1 : 0),
        0
      );

      return {
        isChecked: selectedCount === leafItems.length,
        isIndeterminate: selectedCount > 0 && selectedCount < leafItems.length
      };
    },
    [selectedDatasetIdSet, selectedEmptyFolderIds, treeState.leafDescendantMap]
  );

  const toggleFolderSelection = useCallback(
    (folderId: string, checked: boolean) => {
      const leafItems = treeState.leafDescendantMap.get(folderId) || [];

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
        return;
      }

      const leafIdSet = new Set(leafItems.map((item) => item._id));
      setSelectedDatasets((prev) => {
        if (checked) {
          const existedIds = new Set(prev.map((item) => item.datasetId));
          const additions = leafItems
            .filter((item) => !existedIds.has(item._id))
            .map((item) => toSelectedDataset(item));
          return [...prev, ...additions];
        }
        return prev.filter((item) => !leafIdSet.has(item.datasetId));
      });
    },
    [treeState.leafDescendantMap]
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

  const isAllSelected = useMemo(() => {
    if (treeState.allLeafItems.length === 0 && treeState.emptyFolderIds.size === 0) return false;

    const allLeavesSelected = treeState.allLeafItems.every((item) =>
      selectedDatasetIdSet.has(item._id)
    );
    const allEmptyFoldersSelected = [...treeState.emptyFolderIds].every((id) =>
      selectedEmptyFolderIds.has(id)
    );

    return allLeavesSelected && allEmptyFoldersSelected;
  }, [selectedDatasetIdSet, selectedEmptyFolderIds, treeState]);

  const handleSelectAll = useCallback(
    (checked: boolean) => {
      if (checked) {
        setSelectedDatasets(treeState.allLeafItems.map(toSelectedDataset));
        setSelectedEmptyFolderIds(new Set(treeState.emptyFolderIds));
      } else {
        setSelectedDatasets([]);
        setSelectedEmptyFolderIds(new Set());
      }
    },
    [treeState]
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
            <Box mr={1}>{t('account_model:train_base_model')}</Box>
            <QuestionTip label={t('account_model:train_base_model_tip')} />
          </Flex>
          <HStack w={'100%'}>
            <MySelect
              flexShrink={0}
              w={'160px'}
              value={baseModelType}
              onChange={handleBaseModelTypeChange}
              list={baseModelTypeOptions}
              placeholder={t('account_model:select_base_model_type')}
            />
            <Box flex={1} minW={0}>
              <MySelect
                w={'100%'}
                value={selectedBaseModel}
                onChange={handleBaseModelChange}
                list={modelOptions}
                placeholder={t('account_model:please_select')}
                isDisabled={!baseModelType}
              />
            </Box>
          </HStack>
        </Box>

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
              isModelNameManuallyEdited.current = true;
              setModelName(e.target.value);
            }}
            bg={'myGray.50'}
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
                        _hover={{ bg: 'myGray.50' }}
                        cursor={'pointer'}
                        onClick={() => {
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
                        <Box
                          w={5}
                          onClick={(e) => {
                            e.stopPropagation();
                          }}
                        >
                          <Checkbox
                            isChecked={folderCheckState.isChecked}
                            isIndeterminate={folderCheckState.isIndeterminate}
                            onChange={(e) => {
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
                        <Box
                          w={5}
                          ml={2}
                          mr={1.5}
                          display={'flex'}
                          alignItems={'center'}
                          justifyContent={'center'}
                          color={'myGray.500'}
                        >
                          {isFolder && childrenIds.length > 0 ? (
                            isExpanded ? (
                              <ChevronDownIcon w={5} h={5} />
                            ) : (
                              <ChevronRightIcon w={5} h={5} />
                            )
                          ) : null}
                        </Box>
                        <Avatar src={item.avatar} w={7} h={7} borderRadius={'sm'} mr={2.5} />
                        <Box flex={1} minW={0}>
                          <Box fontSize={'sm'} color={'myGray.900'} lineHeight={1}>
                            {item.name}
                          </Box>
                          <Box fontSize={'xs'} color={'myGray.500'} mt={0.5}>
                            {isFolder ? t('common:Folder') : item.vectorModel?.name}
                          </Box>
                        </Box>
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
          isDisabled={!selectedBaseModel || !modelName.trim() || selectedDatasets.length === 0}
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
