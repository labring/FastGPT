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
import { ChevronRightIcon, CloseIcon } from '@chakra-ui/icons';
import { useTranslation } from 'next-i18next';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/model';
import dynamic from 'next/dynamic';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useToast } from '@fastgpt/web/hooks/useToast';
import MySelect from '@fastgpt/web/components/common/MySelect';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';
import Avatar from '@fastgpt/web/components/common/Avatar';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useDatasetSelect } from '@/components/core/dataset/SelectModal';
import FolderPath from '@/components/common/folder/Path';
import type { SelectedDatasetType } from '@fastgpt/global/core/workflow/type/io';
import type { DatasetListItemType } from '@fastgpt/global/core/dataset/type';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { createEmbeddingTrainTask, createRerankTrainTask } from '@/web/core/app/api/train';

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

const labelStyles = {
  fontSize: 'sm' as const,
  color: 'myGray.900',
  mb: 1,
  fontWeight: 'medium' as const
};

const BaseModelTrainModal = ({
  onClose,
  defaultBaseModel,
  onSuccess
}: BaseModelTrainModalProps) => {
  const { t } = useTranslation();
  const { toast } = useToast();
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
  const [needsAutoSelect, setNeedsAutoSelect] = useState(!!defaultBaseModel?.model);

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

  const {
    paths,
    parentId,
    setParentId,
    searchKey,
    setSearchKey,
    datasets: rawDatasets,
    isFetching,
    loadDatasets
  } = useDatasetSelect();

  const datasets = useMemo(() => {
    if (baseModelType === ModelTypeEnum.embedding && selectedBaseModel) {
      return rawDatasets.filter(
        (item: DatasetListItemType) =>
          item.type === DatasetTypeEnum.folder || item.vectorModel?.model === selectedBaseModel
      );
    }
    return rawDatasets;
  }, [rawDatasets, baseModelType, selectedBaseModel]);

  const visibleNonFolderDatasets = useMemo(
    () => datasets.filter((item: DatasetListItemType) => item.type !== DatasetTypeEnum.folder),
    [datasets]
  );

  useEffect(() => {
    if (needsAutoSelect && !isFetching && selectedBaseModel) {
      setSelectedDatasets(
        visibleNonFolderDatasets.map((item: DatasetListItemType) => ({
          datasetId: item._id,
          avatar: item.avatar,
          name: item.name,
          vectorModel: item.vectorModel,
          datasetType: item.type,
          dataCount: item.dataCount
        }))
      );
      setNeedsAutoSelect(false);
    }
  }, [needsAutoSelect, isFetching, selectedBaseModel, visibleNonFolderDatasets]);

  useEffect(() => {
    if (defaultBaseModel?.model) {
      autoFillModelName(defaultBaseModel.model);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleBaseModelTypeChange = useCallback(
    (type: string) => {
      setBaseModelType(type as ModelTypeEnum.rerank | ModelTypeEnum.embedding);
      setSelectedBaseModel('');
      setSelectedDatasets([]);
      setNeedsAutoSelect(false);
      setParentId('');
      setSearchKey('');
    },
    [setParentId, setSearchKey]
  );

  const handleBaseModelChange = useCallback(
    (model: string) => {
      setSelectedBaseModel(model);
      setSelectedDatasets([]);
      setNeedsAutoSelect(true);
      setParentId('');
      setSearchKey('');
      autoFillModelName(model);
      loadDatasets();
    },
    [autoFillModelName, setParentId, setSearchKey, loadDatasets]
  );

  const isDatasetSelected = useCallback(
    (datasetId: string) => selectedDatasets.some((d) => d.datasetId === datasetId),
    [selectedDatasets]
  );

  const isAllSelected = useMemo(() => {
    if (visibleNonFolderDatasets.length === 0) return false;
    return visibleNonFolderDatasets.every((item: DatasetListItemType) =>
      isDatasetSelected(item._id)
    );
  }, [visibleNonFolderDatasets, isDatasetSelected]);

  const onSelectDataset = useCallback((item: DatasetListItemType, checked: boolean) => {
    if (checked) {
      setSelectedDatasets((prev) => [
        ...prev,
        {
          datasetId: item._id,
          avatar: item.avatar,
          name: item.name,
          vectorModel: item.vectorModel,
          datasetType: item.type,
          dataCount: item.dataCount
        }
      ]);
    } else {
      setSelectedDatasets((prev) => prev.filter((d) => d.datasetId !== item._id));
    }
  }, []);

  const handleSelectAll = useCallback(
    (checked: boolean) => {
      if (checked) {
        const newSelections = visibleNonFolderDatasets
          .filter((item: DatasetListItemType) => !isDatasetSelected(item._id))
          .map((item: DatasetListItemType) => ({
            datasetId: item._id,
            avatar: item.avatar,
            name: item.name,
            vectorModel: item.vectorModel,
            datasetType: item.type,
            dataCount: item.dataCount
          }));
        setSelectedDatasets((prev) => [...prev, ...newSelections]);
      } else {
        const idsToRemove = new Set(
          visibleNonFolderDatasets.map((d: DatasetListItemType) => d._id)
        );
        setSelectedDatasets((prev) => prev.filter((d) => !idsToRemove.has(d.datasetId)));
      }
    },
    [visibleNonFolderDatasets, isDatasetSelected]
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
      onSuccess: () => {
        onSuccess?.();
        onClose();
      },
      onError: (error) => {
        toast({
          status: 'error',
          title: (error as Error).message
        });
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
      isLoading={isFetching && !!selectedBaseModel}
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
              {!selectedBaseModel ? (
                <EmptyTip text={t('account_model:train_select_base_model_first')} />
              ) : (
                <>
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
                  >
                    {!searchKey && paths.length === 0 && datasets.length > 0 && (
                      <Box
                        fontSize={'xs'}
                        py={0.5}
                        px={1.5}
                        borderRadius={'sm'}
                        color={'myGray.700'}
                        fontWeight={'bold'}
                        cursor={'pointer'}
                        _hover={{ bg: 'myGray.100' }}
                        onClick={() => setParentId('')}
                      >
                        {t('common:root_folder')}
                      </Box>
                    )}
                    {!searchKey && paths.length > 0 && (
                      <FolderPath
                        paths={paths.map((path) => ({
                          parentId: path.parentId,
                          parentName: path.parentName
                        }))}
                        FirstPathDom={t('common:root_folder')}
                        onClick={(e) => setParentId(e)}
                      />
                    )}
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
                    {datasets.length === 0 && !isFetching && (
                      <EmptyTip text={t('common:folder.empty')} />
                    )}
                    {datasets.map((item: DatasetListItemType) => (
                      <Box key={item._id} userSelect={'none'}>
                        <Flex
                          align={'center'}
                          pr={2}
                          pl={3}
                          py={1.5}
                          borderRadius={'md'}
                          _hover={{ bg: 'myGray.50' }}
                          cursor={'pointer'}
                          onClick={() => {
                            if (item.type === DatasetTypeEnum.folder) {
                              if (searchKey) setSearchKey('');
                              setParentId(item._id);
                            } else {
                              onSelectDataset(item, !isDatasetSelected(item._id));
                            }
                          }}
                        >
                          <Box w={5} onClick={(e) => e.stopPropagation()}>
                            {item.type !== DatasetTypeEnum.folder && (
                              <Checkbox
                                isChecked={isDatasetSelected(item._id)}
                                onChange={(e) => onSelectDataset(item, e.target.checked)}
                                colorScheme={'blue'}
                                size={'sm'}
                              />
                            )}
                          </Box>
                          <Avatar
                            src={item.avatar}
                            w={7}
                            h={7}
                            borderRadius={'sm'}
                            ml={2}
                            mr={2.5}
                          />
                          <Box flex={1} minW={0}>
                            <Box fontSize={'sm'} color={'myGray.900'} lineHeight={1}>
                              {item.name}
                            </Box>
                            <Box fontSize={'xs'} color={'myGray.500'} mt={0.5}>
                              {item.type === DatasetTypeEnum.folder
                                ? t('common:Folder')
                                : item.vectorModel?.name}
                            </Box>
                          </Box>
                          {item.type === DatasetTypeEnum.folder && (
                            <ChevronRightIcon w={5} h={5} color={'myGray.500'} />
                          )}
                        </Flex>
                      </Box>
                    ))}
                  </VStack>
                  {datasets.length > 0 && (
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
                </>
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
