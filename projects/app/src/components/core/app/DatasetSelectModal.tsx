import React, { useMemo, useState, useCallback } from 'react';
import {
  Flex,
  Box,
  Button,
  ModalBody,
  ModalFooter,
  useTheme,
  Grid,
  Input,
  InputGroup,
  InputLeftElement,
  Checkbox,
  Text,
  VStack,
  HStack,
  IconButton,
  Spacer
} from '@chakra-ui/react';
import { SearchIcon, ChevronRightIcon, CloseIcon, InfoIcon } from '@chakra-ui/icons';
import Avatar from '@fastgpt/web/components/common/Avatar';
import type { SelectedDatasetType } from '@fastgpt/global/core/workflow/type/io';
import { useToast } from '@fastgpt/web/hooks/useToast';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { useTranslation } from 'next-i18next';
import DatasetSelectContainer, { useDatasetSelect } from '@/components/core/dataset/SelectModal';
import { useLoading } from '@fastgpt/web/hooks/useLoading';
import { getDatasets } from '@/web/core/dataset/api';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import FolderPath from '@/components/common/folder/Path';

// Dataset selection modal component
export const DatasetSelectModal = ({
  isOpen,
  defaultSelectedDatasets = [],
  onChange,
  onClose
}: {
  isOpen: boolean;
  defaultSelectedDatasets: SelectedDatasetType;
  onChange: (e: SelectedDatasetType) => void;
  onClose: () => void;
}) => {
  // Translation function
  const { t } = useTranslation();
  const theme = useTheme();
  // Current selected datasets, initialized with defaultSelectedDatasets
  const [selectedDatasets, setSelectedDatasets] =
    useState<SelectedDatasetType>(defaultSelectedDatasets);
  // Search keyword state
  const [searchKey, setSearchKey] = useState<string>('');
  // Expanded folder IDs
  const [expandedFolders, setExpandedFolders] = useState<string[]>([]);
  const { toast } = useToast();
  // paths: current path, setParentId: switch folder, datasets: current available datasets, isFetching: loading state
  const { paths, setParentId, datasets, isFetching } = useDatasetSelect();

  // Fetch all datasets for folder logic
  const { data: allDatasets } = useRequest2(
    () => getDatasets({ parentId: '', getAllDatasets: true }),
    {
      manual: false,
      refreshDeps: []
    }
  );

  const { Loading } = useLoading();

  // Filter dataset list by search keyword
  const filteredDatasets = useMemo(() => {
    if (!searchKey.trim()) {
      return datasets;
    }
    const dataSource = allDatasets || [];
    const searchResults = dataSource.filter(
      (item) =>
        item.name.toLowerCase().includes(searchKey.toLowerCase()) ||
        item.intro?.toLowerCase().includes(searchKey.toLowerCase())
    );
    return searchResults;
  }, [datasets, searchKey, allDatasets]);

  // The vector model of the first selected dataset
  const activeVectorModel = selectedDatasets[0]?.vectorModel?.model;

  // Get direct datasets under a folder (excluding subfolders)
  const getDirectDatasets = useCallback(
    (folderId?: string) => {
      const dataSource = allDatasets || [];
      if (dataSource.length === 0) {
        return [];
      }
      const result = dataSource.filter(
        (item) =>
          item.type !== DatasetTypeEnum.folder &&
          (folderId ? (item as any).parentId === folderId : !(item as any).parentId)
      );
      return result;
    },
    [allDatasets]
  );

  // Check if a folder is selectable: all direct datasets in the folder have the same vector model && (no other datasets selected || folder's vector model matches current selection)
  const isFolderSelectable = useCallback(
    (folderId: string) => {
      const directDatasets = getDirectDatasets(folderId);
      if (directDatasets.length === 0) {
        return false;
      }
      const firstVectorModel = directDatasets[0]?.vectorModel?.model;
      const allSameIndex = directDatasets.every(
        (item) => item.vectorModel?.model === firstVectorModel
      );
      if (!allSameIndex) {
        return false;
      }
      if (!activeVectorModel) {
        return true;
      }
      const isCompatible = firstVectorModel === activeVectorModel;
      return isCompatible;
    },
    [getDirectDatasets, activeVectorModel]
  );

  // Check if all direct datasets in a folder are selected
  const isFolderFullySelected = useCallback(
    (folderId: string) => {
      const directDatasets = getDirectDatasets(folderId);
      if (directDatasets.length === 0) {
        return false;
      }
      const selectedCount = directDatasets.filter((item) =>
        selectedDatasets.some((selected) => selected.datasetId === item._id)
      ).length;
      const isFullySelected = directDatasets.every((item) =>
        selectedDatasets.some((selected) => selected.datasetId === item._id)
      );
      return isFullySelected;
    },
    [getDirectDatasets, selectedDatasets]
  );

  // Handle dataset selection
  const handleDatasetSelect = (item: any, checked: boolean) => {
    if (checked) {
      if (activeVectorModel && activeVectorModel !== item.vectorModel.model) {
        toast({
          status: 'warning',
          title: t('common:dataset.Select Dataset Tips')
        });
        return;
      }
      setSelectedDatasets((prev) => [
        ...prev,
        {
          datasetId: item._id,
          avatar: item.avatar,
          name: item.name,
          vectorModel: item.vectorModel
        }
      ]);
    } else {
      setSelectedDatasets((prev) => prev.filter((dataset) => dataset.datasetId !== item._id));
    }
  };

  // Handle folder selection: select or deselect all direct datasets under the folder
  const handleFolderSelect = (folderId: string, checked: boolean) => {
    const directDatasets = getDirectDatasets(folderId);
    if (checked) {
      const unselectedDatasets = directDatasets.filter((item) => !isDatasetSelected(item._id));
      const newSelections = unselectedDatasets.map((item) => ({
        datasetId: item._id,
        avatar: item.avatar,
        name: item.name,
        vectorModel: item.vectorModel
      }));
      setSelectedDatasets((prev) => {
        const newState = [...prev, ...newSelections];
        return newState;
      });
    } else {
      const datasetIds = directDatasets.map((item) => item._id);
      setSelectedDatasets((prev) => {
        const newState = prev.filter((dataset) => !datasetIds.includes(dataset.datasetId));
        return newState;
      });
    }
  };

  // Handle folder expand/collapse
  const handleFolderToggle = (folderId: string) => {
    setExpandedFolders((prev) =>
      prev.includes(folderId) ? prev.filter((id) => id !== folderId) : [...prev, folderId]
    );
  };

  // Remove a selected dataset
  const removeSelectedDataset = (datasetId: string) => {
    setSelectedDatasets((prev) => prev.filter((dataset) => dataset.datasetId !== datasetId));
  };

  // Check if a dataset is selected
  const isDatasetSelected = useCallback(
    (datasetId: string) => {
      return selectedDatasets.some((dataset) => dataset.datasetId === datasetId);
    },
    [selectedDatasets]
  );

  // Check if a dataset is disabled (vector model mismatch)
  const isDatasetDisabled = (item: any) => {
    return activeVectorModel && activeVectorModel !== item.vectorModel.model;
  };

  // Get all compatible datasets in the current scope (including already selected)
  const getAllCompatibleDatasets = useCallback(() => {
    const visibleDatasets = filteredDatasets.filter((item) => item.type !== DatasetTypeEnum.folder);
    const targetModel = activeVectorModel || visibleDatasets[0]?.vectorModel?.model;
    if (!targetModel) {
      return [];
    }
    if (searchKey.trim()) {
      return visibleDatasets.filter((item) => item.vectorModel.model === targetModel);
    }
    const compatibleDatasets = [];
    // 1. Direct datasets in current directory
    const directDatasets = visibleDatasets.filter((item) => item.vectorModel.model === targetModel);
    compatibleDatasets.push(...directDatasets);
    // 2. Direct datasets under folders in current directory
    const folders = filteredDatasets.filter((item) => item.type === DatasetTypeEnum.folder);
    for (const folder of folders) {
      const folderDirectDatasets = getDirectDatasets(folder._id);
      const folderCompatibleDatasets = folderDirectDatasets.filter(
        (item) => item.vectorModel.model === targetModel && isFolderSelectable(folder._id)
      );
      compatibleDatasets.push(...folderCompatibleDatasets);
    }
    return compatibleDatasets;
  }, [filteredDatasets, activeVectorModel, searchKey, getDirectDatasets, isFolderSelectable]);

  // Get selectable compatible datasets (not already selected)
  const getCompatibleDatasets = useCallback(() => {
    return getAllCompatibleDatasets().filter((item) => !isDatasetSelected(item._id));
  }, [getAllCompatibleDatasets, isDatasetSelected]);

  // Select all / Deselect all
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const compatibleDatasets = getCompatibleDatasets();
      const newSelections = compatibleDatasets.map((item) => ({
        datasetId: item._id,
        avatar: item.avatar,
        name: item.name,
        vectorModel: item.vectorModel
      }));
      setSelectedDatasets((prev) => [...prev, ...newSelections]);
    } else {
      const allCompatibleDatasets = getAllCompatibleDatasets();
      const datasetIdsToRemove = allCompatibleDatasets.map((item) => item._id);
      setSelectedDatasets((prev) =>
        prev.filter((dataset) => !datasetIdsToRemove.includes(dataset.datasetId))
      );
    }
  };

  // Check if all compatible datasets are selected
  const isAllSelected = useMemo(() => {
    try {
      if (filteredDatasets.length === 0) {
        return false;
      }
      const visibleDatasets = filteredDatasets.filter(
        (item) => item.type !== DatasetTypeEnum.folder
      );
      if (visibleDatasets.length === 0) {
        return false;
      }
      const targetModel = activeVectorModel || visibleDatasets[0]?.vectorModel?.model;
      if (!targetModel) {
        return false;
      }
      let allCompatibleDatasets = [];
      if (searchKey.trim()) {
        allCompatibleDatasets = visibleDatasets.filter(
          (item) => item.vectorModel.model === targetModel
        );
      } else {
        // 1. Direct datasets in current directory
        const directDatasets = visibleDatasets.filter(
          (item) => item.vectorModel.model === targetModel
        );
        allCompatibleDatasets.push(...directDatasets);
        // 2. Direct datasets under folders in current directory
        const folders = filteredDatasets.filter((item) => item.type === DatasetTypeEnum.folder);
        for (const folder of folders) {
          const folderDirectDatasets = getDirectDatasets(folder._id);
          const folderCompatibleDatasets = folderDirectDatasets.filter(
            (item) => item.vectorModel.model === targetModel && isFolderSelectable(folder._id)
          );
          allCompatibleDatasets.push(...folderCompatibleDatasets);
        }
      }
      const selectedCount = allCompatibleDatasets.filter((item) =>
        isDatasetSelected(item._id)
      ).length;
      const result =
        allCompatibleDatasets.length > 0 &&
        allCompatibleDatasets.every((item) => isDatasetSelected(item._id));
      return result;
    } catch (error) {
      return false;
    }
  }, [
    filteredDatasets,
    activeVectorModel,
    isDatasetSelected,
    searchKey,
    getDirectDatasets,
    isFolderSelectable
  ]);

  // Render component
  return (
    <DatasetSelectContainer
      isOpen={isOpen}
      paths={[]}
      setParentId={setParentId}
      tips={null}
      onClose={onClose}
    >
      {/* Main vertical layout */}
      <Flex h={'100%'} flexDirection={'column'} flex={'1'}>
        <ModalBody flex={'1'}>
          {/* Two-column layout */}
          <Grid
            border="1px solid"
            borderColor="myGray.200"
            borderRadius="0.5rem"
            gridTemplateColumns="1fr 1fr"
            h={'100%'}
          >
            {/* Left: search and dataset list */}
            <Flex
              h={'100%'}
              flexDirection="column"
              borderRight="1px solid"
              borderColor="myGray.200"
              p="4"
            >
              {/* Search box */}
              <InputGroup mb={4} flexShrink={0}>
                <InputLeftElement>
                  <SearchIcon w={'16px'} color={'gray.400'} />
                </InputLeftElement>
                <Input
                  placeholder={t('app:Search_dataset')}
                  value={searchKey}
                  onChange={(e) => setSearchKey(e.target.value)}
                  size="md"
                />
              </InputGroup>

              {/* Path display area - always occupies space, content changes based on search state */}
              <Box
                mb={2}
                py={1}
                px={2}
                fontSize="sm"
                minH="32px"
                display="flex"
                alignItems="center"
                flexShrink={0}
              >
                {!searchKey.trim() ? (
                  paths.length === 0 ? (
                    // Root directory path
                    <Flex flex={1} ml={-2} alignItems="center">
                      <Box
                        fontSize={['xs', 'sm']}
                        py={0.5}
                        px={1.5}
                        borderRadius="sm"
                        maxW={['45vw', '250px']}
                        className="textEllipsis"
                        color="myGray.700"
                        fontWeight="bold"
                        cursor="pointer"
                        _hover={{
                          bg: 'myGray.100'
                        }}
                        onClick={() => setParentId('')}
                      >
                        {t('common:root_folder')}
                      </Box>
                      <MyIcon name={'common/line'} color={'myGray.500'} mx={1} width={'5px'} />
                    </Flex>
                  ) : (
                    // Subdirectory path
                    <FolderPath
                      paths={paths.map((path, i) => ({
                        parentId: path.parentId,
                        parentName: path.parentName
                      }))}
                      FirstPathDom={t('common:root_folder')}
                      onClick={(e) => {
                        setParentId(e);
                      }}
                    />
                  )
                ) : (
                  // Search state: show search tip, keep space
                  <Box as="div" width="100%" minH={'25px'} display="flex" alignItems="center">
                    <Text fontSize="sm" color="gray.500">
                      {t('chat:search_results')}
                    </Text>
                  </Box>
                )}
              </Box>

              {/* Dataset list */}
              <VStack align="stretch" spacing="4px" flex={'1 0 0'} overflowY="auto" h={0}>
                {filteredDatasets.length === 0 ? (
                  <EmptyTip text={t('common:folder.empty')} />
                ) : (
                  filteredDatasets.map((item) => (
                    <Box key={item._id}>
                      <Flex
                        align="center"
                        py={0}
                        px={2}
                        borderRadius="md"
                        _hover={{ bg: 'gray.50' }}
                        cursor="pointer"
                        minH="38px"
                        height="38px"
                        onClick={() => {
                          if (item.type === DatasetTypeEnum.folder) {
                            if (searchKey.trim()) {
                              setSearchKey('');
                            }
                            setParentId(item._id);
                          }
                        }}
                      >
                        {/* Checkbox for both folder and dataset */}
                        <Box
                          w="24px"
                          display="flex"
                          alignItems="center"
                          justifyContent="center"
                          onClick={(e) => e.stopPropagation()} // Prevent parent click when clicking checkbox
                        >
                          {item.type === DatasetTypeEnum.folder ? (
                            (() => {
                              const isSelectable = isFolderSelectable(item._id);
                              const isFullySelected = isFolderFullySelected(item._id);
                              return (
                                <Checkbox
                                  isChecked={isFullySelected}
                                  onChange={(e) => {
                                    const checked = e.target.checked;
                                    if (!isSelectable) {
                                      toast({
                                        status: 'warning',
                                        title: t('common:dataset.Select Dataset Tips')
                                      });
                                      return;
                                    }
                                    handleFolderSelect(item._id, checked);
                                  }}
                                  colorScheme="blue"
                                  sx={
                                    !isSelectable
                                      ? {
                                          '& .chakra-checkbox__control': {
                                            borderColor: 'gray.200',
                                            opacity: 0.5,
                                            width: '18px',
                                            height: '18px',
                                            borderWidth: '2px'
                                          },
                                          '& .chakra-checkbox__control::before': {
                                            width: '10px',
                                            height: '10px'
                                          }
                                        }
                                      : {
                                          '& .chakra-checkbox__control': {
                                            width: '18px',
                                            height: '18px',
                                            borderWidth: '2px'
                                          },
                                          '& .chakra-checkbox__control::before': {
                                            width: '10px',
                                            height: '10px'
                                          }
                                        }
                                  }
                                />
                              );
                            })()
                          ) : (
                            <Checkbox
                              isChecked={isDatasetSelected(item._id)}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                if (checked && isDatasetDisabled(item)) {
                                  toast({
                                    status: 'warning',
                                    title: t('common:dataset.Select Dataset Tips')
                                  });
                                  return;
                                }
                                handleDatasetSelect(item, checked);
                              }}
                              colorScheme="blue"
                              sx={
                                isDatasetDisabled(item)
                                  ? {
                                      '& .chakra-checkbox__control': {
                                        borderColor: 'gray.200',
                                        opacity: 0.5,
                                        width: '18px',
                                        height: '18px',
                                        borderWidth: '2px'
                                      },
                                      '& .chakra-checkbox__control::before': {
                                        width: '10px',
                                        height: '10px'
                                      }
                                    }
                                  : {
                                      '& .chakra-checkbox__control': {
                                        width: '18px',
                                        height: '18px',
                                        borderWidth: '2px'
                                      },
                                      '& .chakra-checkbox__control::before': {
                                        width: '10px',
                                        height: '10px'
                                      }
                                    }
                              }
                            />
                          )}
                        </Box>

                        {/* Avatar */}
                        <Avatar src={item.avatar} w="22px" h="22px" borderRadius="sm" mx={3} />

                        {/* Name and type */}
                        <Box flex={1} minW={0}>
                          <Text fontSize="sm" fontWeight="medium" isTruncated>
                            {item.name}
                          </Text>
                          {item.type === DatasetTypeEnum.folder ? (
                            <Text fontSize="xs" color="gray.500">
                              {t('common:Folder')}
                            </Text>
                          ) : (
                            <Text fontSize="xs" color="gray.500">
                              {t('app:Index')}: {item.vectorModel.name}
                            </Text>
                          )}
                        </Box>

                        {/* Folder expand arrow */}
                        {item.type === DatasetTypeEnum.folder && (
                          <Box mr={10}>
                            <ChevronRightIcon
                              w="20px"
                              h="20px"
                              color="gray.500"
                              strokeWidth="1px"
                            />
                          </Box>
                        )}
                      </Flex>
                    </Box>
                  ))
                )}
              </VStack>

              {/* Select all / Deselect all */}
              <Flex mt={3} justify="space-between" align="center" flexShrink={0}>
                <Checkbox
                  isChecked={isAllSelected}
                  onChange={(e) => handleSelectAll(e.target.checked)}
                  colorScheme="blue"
                  sx={{
                    '& .chakra-checkbox__control': {
                      width: '18px',
                      height: '18px',
                      borderWidth: '2px'
                    },
                    '& .chakra-checkbox__control::before': {
                      width: '10px',
                      height: '10px'
                    }
                  }}
                >
                  <Text fontSize="sm">{t('common:Select_all')}</Text>
                </Checkbox>
                {/* 
                <Button
                  size="sm"
                  variant="outline"
                  colorScheme="gray"
                  bg="gray.50"
                  borderColor="gray.300"
                  onClick={() => setSelectedDatasets([])}
                  _hover={{
                    bg: 'gray.100',
                    borderColor: 'gray.400'
                  }}
                >
                  <Text fontSize="sm" color="gray.500">
                    {t('common:Clear_all')}
                  </Text>
                </Button>
                */}
              </Flex>
            </Flex>

            {/* Right: selected datasets display */}
            <Flex h={'100%'} p="4" flexDirection="column">
              {/* Selected count display */}
              <Box mb={3} flexShrink={0}>
                <Text fontSize="sm" color="gray.600">
                  {t('app:Selected')}: {selectedDatasets.length} {t('app:dataset')}
                </Text>
              </Box>
              {/* Selected dataset list */}
              <VStack align="stretch" spacing={8} flex={'1 0 0'} overflowY="auto" h={0}>
                {selectedDatasets.length === 0 ? (
                  <Box
                    display="flex"
                    alignItems="center"
                    justifyContent="center"
                    h="full"
                    color="gray.400"
                  >
                    <VStack spacing={8}>
                      <MyIcon name="empty" w="48px" color="transparent" />
                      <Text fontSize="sm">{t('app:No_selected_dataset')}</Text>
                    </VStack>
                  </Box>
                ) : (
                  selectedDatasets.map((item) => (
                    <Box
                      key={item.datasetId}
                      px={2}
                      py={0}
                      borderRadius="md"
                      _hover={{ bg: 'gray.50' }}
                      cursor="pointer"
                      minH="24px"
                      display="flex"
                      alignItems="center"
                    >
                      <Avatar src={item.avatar} w="24px" h="24px" borderRadius="sm" mr={3} />
                      <Box flex={1} minW={0}>
                        <Text fontSize="sm" fontWeight="medium" isTruncated>
                          {item.name}
                        </Text>
                      </Box>
                      <IconButton
                        aria-label="Remove"
                        icon={<CloseIcon w="10px" h="10px" />}
                        size="xs"
                        variant="ghost"
                        color="black"
                        _hover={{
                          bg: 'gray.200'
                        }}
                        onClick={() => removeSelectedDataset(item.datasetId)}
                      />
                    </Box>
                  ))
                )}
              </VStack>
            </Flex>
          </Grid>
        </ModalBody>

        {/* Modal footer button area */}
        <ModalFooter flexShrink={0}>
          <HStack spacing={4} w="full" align="center">
            <Spacer />
            <HStack spacing={3} align="center">
              <Box px={3} py={2} borderRadius="md" bg="#F0F4FF" display="flex" alignItems="center">
                <InfoIcon w="14px" h="14px" color="blue.500" mr={2} />
                <Text fontSize="xs" color="blue.600">
                  {t('common:dataset.Select Dataset Tips')}
                </Text>
              </Box>
              <Button
                colorScheme="blue"
                onClick={() => {
                  // Close modal and return selected datasets
                  onClose();
                  onChange(selectedDatasets);
                }}
              >
                {t('common:Confirm')}
              </Button>
            </HStack>
          </HStack>
        </ModalFooter>

        {/* Loading animation, shown when isFetching is true */}
        <Loading fixed={false} loading={isFetching} />
      </Flex>
    </DatasetSelectContainer>
  );
};

export default DatasetSelectModal;
