import React, { useMemo, useState, useCallback, useEffect } from 'react';
import {
  Flex,
  Box,
  Button,
  ModalBody,
  ModalFooter,
  Grid,
  Checkbox,
  VStack,
  HStack,
  IconButton,
  Spacer
} from '@chakra-ui/react';
import { ChevronRightIcon, CloseIcon, InfoIcon } from '@chakra-ui/icons';
import Avatar from '@fastgpt/web/components/common/Avatar';
import type { SelectedDatasetType } from '@fastgpt/global/core/workflow/type/io';
import type { DatasetListItemType } from '@fastgpt/global/core/dataset/type';
import type { ParentTreePathItemType } from '@fastgpt/global/common/parentFolder/type';
import { useToast } from '@fastgpt/web/hooks/useToast';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { useTranslation } from 'next-i18next';
import MyModal from '@fastgpt/web/components/common/MyModal';
import MyBox from '@fastgpt/web/components/common/MyBox';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';
import { useDatasetSelect } from '@/components/core/dataset/SelectModal';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
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
  // Current selected datasets, initialized with defaultSelectedDatasets
  const [selectedDatasets, setSelectedDatasets] =
    useState<SelectedDatasetType>(defaultSelectedDatasets);
  const { toast } = useToast();

  // Sync selectedDatasets when defaultSelectedDatasets changes
  useEffect(() => {
    setSelectedDatasets(defaultSelectedDatasets);
  }, [defaultSelectedDatasets]);

  // Use server-side search, following the logic of the dataset list page
  const { paths, setParentId, searchKey, setSearchKey, datasets, isFetching } = useDatasetSelect();

  // The vector model of the first selected dataset
  const activeVectorModel = selectedDatasets[0]?.vectorModel?.model;

  // Handle dataset selection
  const handleDatasetSelect = (item: DatasetListItemType, checked: boolean) => {
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
  const isDatasetDisabled = (item: DatasetListItemType) => {
    return activeVectorModel && activeVectorModel !== item.vectorModel.model;
  };

  // Cache visible datasets (non-folder datasets) to avoid recalculation
  const visibleDatasets = useMemo(() => {
    return (datasets || []).filter(
      (item: DatasetListItemType) => item.type !== DatasetTypeEnum.folder
    );
  }, [datasets]);

  // Cache compatible datasets by vector model to avoid repeated filtering
  const compatibleDatasetsByModel = useMemo(() => {
    const targetModel = activeVectorModel || visibleDatasets[0]?.vectorModel?.model;
    if (!targetModel) {
      return [];
    }
    return visibleDatasets.filter(
      (item: DatasetListItemType) => item.vectorModel.model === targetModel
    );
  }, [visibleDatasets, activeVectorModel]);

  // Get compatible datasets with optional filtering
  const getCompatibleDatasets = useCallback(
    (includeSelected = false) => {
      // If includeSelected is false, filter out already selected datasets
      return includeSelected
        ? compatibleDatasetsByModel
        : compatibleDatasetsByModel.filter(
            (item: DatasetListItemType) => !isDatasetSelected(item._id)
          );
    },
    [compatibleDatasetsByModel, isDatasetSelected]
  );

  // Select all / Deselect all
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const compatibleDatasets = getCompatibleDatasets(false); // Exclude already selected
      const newSelections = compatibleDatasets.map((item: DatasetListItemType) => ({
        datasetId: item._id,
        avatar: item.avatar,
        name: item.name,
        vectorModel: item.vectorModel
      }));
      setSelectedDatasets((prev) => [...prev, ...newSelections]);
    } else {
      const allCompatibleDatasets = getCompatibleDatasets(true); // Include already selected
      const datasetIdsToRemove = allCompatibleDatasets.map((item: DatasetListItemType) => item._id);
      setSelectedDatasets((prev) =>
        prev.filter((dataset) => !datasetIdsToRemove.includes(dataset.datasetId))
      );
    }
  };

  // Check if all compatible datasets are selected
  const isAllSelected = useMemo(() => {
    if (compatibleDatasetsByModel.length === 0) {
      return false;
    }

    const selectedDatasetIds = new Set(selectedDatasets.map((dataset) => dataset.datasetId));
    return compatibleDatasetsByModel.every((item: DatasetListItemType) =>
      selectedDatasetIds.has(item._id)
    );
  }, [compatibleDatasetsByModel, selectedDatasets]);

  // Extract EmptyState component to avoid duplication
  const EmptyState = ({ message }: { message: string }) => (
    <Box display="flex" alignItems="center" justifyContent="center" h="full" color="myGray.400">
      <VStack spacing={2} fontSize="sm">
        <MyIcon name="empty" w={12} color="transparent" />
        <Box fontSize="sm">{message}</Box>
      </VStack>
    </Box>
  );

  // Render component
  return (
    <MyModal
      iconSrc="/imgs/workflow/db.png"
      title={t('common:core.chat.Select dataset')}
      isOpen={isOpen}
      onClose={onClose}
      minW="800px"
      maxW={'800px'}
      h={'100%'}
      minH={'496px'}
      maxH={'90vh'}
      isCentered
    >
      <MyBox isLoading={isFetching} h={'100%'} overflow="hidden">
        {/* Main vertical layout */}
        <Flex h="100%" direction="column" flex={1} overflow="hidden" minH={0}>
          <ModalBody flex={1} overflow="hidden" minH={0}>
            {/* Two-column layout */}
            <Grid
              border="1px solid"
              borderColor="myGray.200"
              borderRadius="md"
              gridTemplateColumns="1fr 1fr"
              h="100%"
              overflow="hidden"
              minH={0}
            >
              {/* Left: search and dataset list */}
              <Flex
                h="100%"
                direction="column"
                borderRight="1px solid"
                borderColor="myGray.200"
                p={4}
                overflow="hidden"
                minH={0}
              >
                {/* Search box */}
                <Box mb={4}>
                  <SearchInput
                    placeholder={t('app:Search_dataset')}
                    value={searchKey}
                    onChange={(e) => setSearchKey(e.target.value)}
                    size="md"
                  />
                </Box>

                {/* Path display area - always occupies space, content changes based on search state */}
                <Box mb={2} py={1} px={2} fontSize="sm" minH={8} display="flex" alignItems="center">
                  {searchKey.trim() && (
                    <Box
                      w="100%"
                      minH={6}
                      display="flex"
                      alignItems="center"
                      fontSize="sm"
                      color="myGray.500"
                    >
                      {t('chat:search_results')}
                    </Box>
                  )}
                  {!searchKey.trim() && paths.length === 0 && (
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
                        _hover={{ bg: 'myGray.100' }}
                        onClick={() => setParentId('')}
                      >
                        {t('common:root_folder')}
                      </Box>
                      <MyIcon name="common/line" color="myGray.500" mx={1} w="5px" />
                    </Flex>
                  )}
                  {!searchKey.trim() && paths.length > 0 && (
                    // Subdirectory path
                    <FolderPath
                      paths={paths.map((path: ParentTreePathItemType) => ({
                        parentId: path.parentId,
                        parentName: path.parentName
                      }))}
                      FirstPathDom={t('common:root_folder')}
                      onClick={(e) => setParentId(e)}
                    />
                  )}
                </Box>

                {/* Dataset list */}
                <VStack align="stretch" spacing={1} flex={1} overflowY="auto" h={0} minH={0}>
                  {(datasets || []).length === 0 && (
                    <EmptyState message={t('common:folder.empty')} />
                  )}
                  {(datasets || []).map((item: DatasetListItemType) => (
                    <Box key={item._id}>
                      <Flex
                        align="center"
                        px={2}
                        borderRadius="md"
                        _hover={{ bg: 'myGray.50' }}
                        cursor="pointer"
                        h="38px"
                        onClick={() => {
                          if (item.type === DatasetTypeEnum.folder) {
                            if (searchKey.trim()) {
                              setSearchKey('');
                            }
                            setParentId(item._id);
                          }
                        }}
                      >
                        <Box
                          w={6}
                          display="flex"
                          alignItems="center"
                          justifyContent="center"
                          onClick={(e) => e.stopPropagation()} // Prevent parent click when clicking checkbox
                        >
                          {item.type !== DatasetTypeEnum.folder && (
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
                              size="sm"
                              variant={isDatasetDisabled(item) ? 'disabled' : undefined}
                            />
                          )}
                        </Box>

                        {/* Avatar */}
                        <Avatar src={item.avatar} w={22} h={22} borderRadius="sm" mx={3} />

                        {/* Name and type */}
                        <Box flex={1} minW={0} fontSize="sm">
                          {item.name}
                          {item.type === DatasetTypeEnum.folder && (
                            <Box fontSize="xs" color="myGray.500">
                              {t('common:Folder')}
                            </Box>
                          )}
                          {item.type !== DatasetTypeEnum.folder && (
                            <Box fontSize="xs" color="myGray.500">
                              {t('app:Index')}: {item.vectorModel.name}
                            </Box>
                          )}
                        </Box>

                        {/* Folder expand arrow */}
                        {item.type === DatasetTypeEnum.folder && (
                          <Box mr={10}>
                            <ChevronRightIcon w={5} h={5} color="myGray.500" strokeWidth="1px" />
                          </Box>
                        )}
                      </Flex>
                    </Box>
                  ))}
                </VStack>

                {/* Select all / Deselect all */}
                <Flex mt={3} justify="space-between" align="center">
                  <Checkbox
                    isChecked={isAllSelected}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    colorScheme="blue"
                    size="sm"
                  >
                    <Box fontSize="sm">{t('common:Select_all')}</Box>
                  </Checkbox>
                  {/* 
                  <Button
                    size="sm"
                    variant="outline"
                    colorScheme="myGray"
                    bg="myGray.50"
                    borderColor="myGray.300"
                    onClick={() => setSelectedDatasets([])}
                    _hover={{
                      bg: 'myGray.100',
                      borderColor: 'myGray.400'
                    }}
                  >
                    <Text fontSize="sm" color="myGray.500">
                      {t('common:Clear_all')}
                    </Text>
                  </Button>
                  */}
                </Flex>
              </Flex>

              {/* Right: selected datasets display */}
              <Flex h="100%" p={4} direction="column" overflow="hidden" minH={0}>
                {/* Selected count display */}
                <Box mb={3} fontSize="sm" color="myGray.600">
                  {t('app:Selected')}: {selectedDatasets.length} {t('app:dataset')}
                </Box>
                {/* Selected dataset list */}
                <VStack align="stretch" spacing={8} flex={1} overflowY="auto" h={0} minH={0}>
                  {selectedDatasets.length === 0 && (
                    <EmptyState message={t('app:No_selected_dataset')} />
                  )}
                  {selectedDatasets.length > 0 &&
                    selectedDatasets.map((item) => (
                      <Box
                        key={item.datasetId}
                        px={2}
                        borderRadius="md"
                        _hover={{ bg: 'myGray.50' }}
                        cursor="pointer"
                        minH={6}
                        display="flex"
                        alignItems="center"
                      >
                        <Avatar src={item.avatar} w={6} h={6} borderRadius="sm" mr={3} />
                        <Box flex={1} minW={0}>
                          <Box fontSize="sm">{item.name}</Box>
                        </Box>
                        <IconButton
                          aria-label="Remove"
                          icon={<CloseIcon w={2.5} h={2.5} />}
                          size="xs"
                          variant="ghost"
                          color="black"
                          _hover={{ bg: 'myGray.200' }}
                          onClick={() => removeSelectedDataset(item.datasetId)}
                        />
                      </Box>
                    ))}
                </VStack>
              </Flex>
            </Grid>
          </ModalBody>

          {/* Modal footer button area */}
          <ModalFooter>
            <HStack spacing={4} w="full" align="center">
              <Spacer />
              <HStack spacing={3} align="center">
                <Box
                  px={3}
                  py={2}
                  borderRadius="md"
                  bg="blue.50"
                  display="flex"
                  alignItems="center"
                  fontSize="xs"
                  color="blue.600"
                >
                  <InfoIcon w={3.5} h={3.5} color="blue.500" mr={2} />
                  {t('common:dataset.Select Dataset Tips')}
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
        </Flex>
      </MyBox>
    </MyModal>
  );
};

export default DatasetSelectModal;
