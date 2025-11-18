import React, { useMemo, useState, useCallback } from 'react';
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
  Spacer,
  useDisclosure
} from '@chakra-ui/react';
import { ChevronRightIcon, CloseIcon } from '@chakra-ui/icons';
import Avatar from '@fastgpt/web/components/common/Avatar';
import type { SelectedDatasetType } from '@fastgpt/global/core/workflow/type/io';
import type { DatasetListItemType } from '@fastgpt/global/core/dataset/type';
import type { ParentTreePathItemType } from '@fastgpt/global/common/parentFolder/type';
import { useToast } from '@fastgpt/web/hooks/useToast';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { useTranslation } from 'next-i18next';
import MyModal from '@fastgpt/web/components/common/MyModal';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';
import { useDatasetSelect } from '@/components/core/dataset/SelectModal';
import FolderPath from '@/components/common/folder/Path';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import QuickCreateDatasetModal from '@/pageComponents/app/detail/components/QuickCreateDatasetModal';
import { useUserStore } from '@/web/support/user/useUserStore';

// Dataset selection modal component
export const DatasetSelectModal = ({
  isOpen,
  defaultSelectedDatasets = [],
  onChange,
  onClose
}: {
  isOpen: boolean;
  defaultSelectedDatasets: SelectedDatasetType[];
  onChange: (e: SelectedDatasetType[]) => void;
  onClose: () => void;
}) => {
  // Translation function
  const { t } = useTranslation();
  // Current selected datasets, initialized with defaultSelectedDatasets
  const [selectedDatasets, setSelectedDatasets] =
    useState<SelectedDatasetType[]>(defaultSelectedDatasets);
  const { toast } = useToast();
  const { userInfo } = useUserStore();

  // Use server-side search, following the logic of the dataset list page
  const {
    paths,
    parentId,
    setParentId,
    searchKey,
    setSearchKey,
    datasets,
    isFetching,
    loadDatasets
  } = useDatasetSelect();

  // The vector model of the first selected dataset
  const activeVectorModel = selectedDatasets[0]?.vectorModel?.model;

  // Check if a dataset is selected
  const isDatasetSelected = useCallback(
    (datasetId: string) => {
      return selectedDatasets.some((dataset) => dataset.datasetId === datasetId);
    },
    [selectedDatasets]
  );

  // Check if a dataset is disabled (vector model mismatch)
  const isDatasetDisabled = (item: DatasetListItemType) => {
    return !!activeVectorModel && activeVectorModel !== item.vectorModel.model;
  };

  // Cache compatible datasets by vector model to avoid repeated filtering
  const compatibleDatasetsByModel = useMemo(() => {
    const visibleDatasets = datasets.filter(
      (item: DatasetListItemType) => item.type !== DatasetTypeEnum.folder
    );

    const targetModel = activeVectorModel || visibleDatasets[0]?.vectorModel?.model;
    if (!targetModel) {
      return [];
    }

    return visibleDatasets.filter(
      (item: DatasetListItemType) => item.vectorModel.model === targetModel
    );
  }, [datasets, activeVectorModel]);

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

  const onSelect = (item: DatasetListItemType, checked: boolean) => {
    if (checked) {
      if (isDatasetDisabled(item)) {
        return toast({
          status: 'warning',
          title: t('app:dataset.Select_dataset_model_tip')
        });
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

  const {
    isOpen: isQuickCreateOpen,
    onOpen: onOpenQuickCreate,
    onClose: onCloseQuickCreate
  } = useDisclosure();
  const isRootEmpty = useMemo(() => {
    return datasets.length === 0 && paths.length === 0 && !searchKey && !isFetching;
  }, [datasets.length, isFetching, paths.length, searchKey]);

  // Render component
  return (
    <MyModal
      iconSrc="/imgs/workflow/db.png"
      title={t('common:core.chat.Select dataset')}
      isOpen={isOpen}
      onClose={onClose}
      minW="800px"
      maxW={'800px'}
      maxH={'90vh'}
      h={'100%'}
      minH={'496px'}
      isCentered
      isLoading={isFetching}
    >
      {/* Main vertical layout */}
      <Flex h="100%" direction="column" flex={1} overflow="hidden" minH={0}>
        <ModalBody flex={1} h={0} overflow="hidden">
          {isRootEmpty ? (
            <VStack h={'full'} justifyContent={'center'}>
              <EmptyTip text={t('app:dataset_empty_tips')} py={4} />
              {userInfo?.team?.permission.hasDatasetCreatePer && (
                <Button onClick={onOpenQuickCreate}>{t('common:Create')}</Button>
              )}
            </VStack>
          ) : (
            <>
              {/* Two-column layout */}
              <Grid
                border="1px solid"
                borderColor="myGray.200"
                borderRadius="md"
                gridTemplateColumns="1fr 1fr"
                h="100%"
                overflow="hidden"
              >
                {/* Left: search and dataset list */}
                <Flex
                  h="100%"
                  direction="column"
                  borderRight="1px solid"
                  borderColor="myGray.200"
                  py={4}
                  overflow="hidden"
                >
                  {/* Search box */}
                  <Box mb={2} px={4}>
                    <SearchInput
                      placeholder={t('app:Search_dataset')}
                      value={searchKey}
                      onChange={(e) => setSearchKey(e.target.value?.trim())}
                      size="md"
                    />
                  </Box>
                  {/* Path display area - always occupies space, content changes based on search state */}
                  <Box
                    mb={2}
                    py={1}
                    px={4}
                    fontSize="sm"
                    minH={8}
                    display="flex"
                    alignItems="center"
                  >
                    {searchKey && (
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
                    {!searchKey && paths.length === 0 && datasets.length > 0 && (
                      // Root directory path
                      <Flex flex={1} alignItems="center">
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
                    {!searchKey && paths.length > 0 && (
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
                  <VStack
                    align="stretch"
                    spacing={1.5}
                    flex={1}
                    px={4}
                    overflowY="auto"
                    h={0}
                    minH={0}
                  >
                    {datasets.length === 0 && !isFetching && (
                      <EmptyTip text={t('common:folder.empty')} />
                    )}
                    {datasets.map((item: DatasetListItemType) => (
                      <Box key={item._id} userSelect={'none'}>
                        <Flex
                          align="center"
                          pr={2}
                          pl={4}
                          py={1.5}
                          borderRadius="md"
                          _hover={{ bg: 'myGray.50' }}
                          cursor="pointer"
                          onClick={() => {
                            if (item.type === DatasetTypeEnum.folder) {
                              if (searchKey) {
                                setSearchKey('');
                              }
                              setParentId(item._id);
                            } else {
                              onSelect(item, !isDatasetSelected(item._id));
                            }
                          }}
                        >
                          <Box
                            w={'5'}
                            onClick={(e) => e.stopPropagation()} // Prevent parent click when clicking checkbox
                          >
                            {item.type !== DatasetTypeEnum.folder && (
                              <Checkbox
                                isChecked={isDatasetSelected(item._id)}
                                isDisabled={isDatasetDisabled(item)}
                                onChange={(e) => {
                                  const checked = e.target.checked;
                                  onSelect(item, checked);
                                }}
                                colorScheme="blue"
                                size="sm"
                              />
                            )}
                          </Box>

                          {/* Avatar */}
                          <Avatar src={item.avatar} w={7} h={7} borderRadius="sm" ml={3} mr={2.5} />

                          {/* Name and type */}
                          <Box flex={1} minW={0}>
                            <Box fontSize="sm" color={'myGray.900'} lineHeight={1}>
                              {item.name}
                            </Box>
                            <Box fontSize="xs" color="myGray.500">
                              {item.type === DatasetTypeEnum.folder ? (
                                <>{t('common:Folder')}</>
                              ) : (
                                <>
                                  {t('app:Index')}: {item.vectorModel.name}
                                </>
                              )}
                            </Box>
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
                  {datasets.length > 0 && (
                    <Flex mt={3} px={4} justify="space-between" align="center">
                      <Checkbox
                        isChecked={isAllSelected}
                        onChange={(e) => {
                          if (e.target.checked) {
                            const compatibleDatasets = compatibleDatasetsByModel.filter(
                              (dataset) => {
                                return !isDatasetSelected(dataset._id);
                              }
                            );
                            const newSelections = compatibleDatasets.map(
                              (item: DatasetListItemType) => ({
                                datasetId: item._id,
                                avatar: item.avatar,
                                name: item.name,
                                vectorModel: item.vectorModel
                              })
                            );
                            setSelectedDatasets((prev) => [...prev, ...newSelections]);
                          } else {
                            const datasetIdsToRemove = compatibleDatasetsByModel.map(
                              (item: DatasetListItemType) => item._id
                            );
                            setSelectedDatasets((prev) =>
                              prev.filter(
                                (dataset) => !datasetIdsToRemove.includes(dataset.datasetId)
                              )
                            );
                          }
                        }}
                        colorScheme="blue"
                        size="sm"
                      >
                        <Box fontSize="sm">{t('common:Select_all')}</Box>
                      </Checkbox>
                    </Flex>
                  )}
                </Flex>

                {/* Right: selected datasets display */}
                <Flex h="100%" py={4} direction="column" overflow="hidden" minH={0}>
                  {!isRootEmpty && (
                    <>
                      {/* Selected count display */}
                      <Box mb={3} px={4} fontSize="sm" color="myGray.600">
                        {t('app:Selected')}: {selectedDatasets.length} {t('app:dataset')}
                      </Box>
                      {/* Selected dataset list */}
                      <VStack
                        align={'stretch'}
                        overflowY={'auto'}
                        spacing={1}
                        flex={1}
                        px={4}
                        h={0}
                        minH={0}
                      >
                        {selectedDatasets.length === 0 && !isFetching && (
                          <EmptyTip text={t('app:No_selected_dataset')} />
                        )}
                        {selectedDatasets.map((item) => (
                          <Flex
                            key={item.datasetId}
                            px={2}
                            py={1.5}
                            borderRadius="md"
                            _hover={{ bg: 'myGray.50' }}
                            cursor="pointer"
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
                              onClick={() =>
                                setSelectedDatasets((prev) =>
                                  prev.filter((dataset) => dataset.datasetId !== item.datasetId)
                                )
                              }
                            />
                          </Flex>
                        ))}
                      </VStack>
                    </>
                  )}
                </Flex>
              </Grid>
            </>
          )}
        </ModalBody>

        {/* Modal footer button area */}
        <ModalFooter>
          <HStack spacing={4} w="full" align="center">
            {!isRootEmpty && userInfo?.team?.permission.hasDatasetCreatePer && (
              <Button
                leftIcon={<MyIcon name="common/addLight" w={4} />}
                variant={'transparentBase'}
                color={'primary.700'}
                fontSize={'mini'}
                onClick={onOpenQuickCreate}
              >
                {t('common:new_create')}
              </Button>
            )}
            <Spacer />
            {isRootEmpty ? (
              <Button
                px={3.5}
                maxH={8}
                fontSize={'mini'}
                variant={'grayBase'}
                onClick={() => {
                  onClose();
                }}
              >
                {t('common:Cancel')}
              </Button>
            ) : (
              <HStack spacing={3} align="center">
                <Flex
                  px={3}
                  py={1.5}
                  borderRadius={'sm'}
                  bg={'primary.50'}
                  alignItems={'center'}
                  fontSize={'11px'}
                  color={'primary.600'}
                  gap={1}
                >
                  <MyIcon name={'common/info'} w={3.5} />
                  {t('app:dataset.Select_dataset_model_tip')}
                </Flex>
                <Button
                  px={3.5}
                  maxH={8}
                  fontSize={'mini'}
                  onClick={() => {
                    // Close modal and return selected datasets
                    onClose();
                    onChange(selectedDatasets);
                  }}
                >
                  {t('common:Confirm')}
                </Button>
              </HStack>
            )}
          </HStack>
        </ModalFooter>
      </Flex>

      {isQuickCreateOpen && (
        <QuickCreateDatasetModal
          parentId={parentId}
          onClose={onCloseQuickCreate}
          onSuccess={(newDataset) => {
            setSelectedDatasets((prev) => [...prev, newDataset]);
            loadDatasets();
          }}
        />
      )}
    </MyModal>
  );
};

export default DatasetSelectModal;
