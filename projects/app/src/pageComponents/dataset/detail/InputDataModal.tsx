import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Flex, Button, Textarea, VStack, type FlexProps } from '@chakra-ui/react';
import type { UseFormRegister } from 'react-hook-form';
import { useFieldArray, useForm } from 'react-hook-form';
import { getDatasetCollectionById } from '@/web/core/dataset/api/collection';
import {
  postInsertData2Dataset,
  getDatasetDataItemById,
  createDatasetDataIndex,
  deleteDatasetDataIndex,
  putDatasetDataById,
  updateDatasetDataIndex
} from '@/web/core/dataset/api/data';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import type { DatasetDataIndexItemType } from '@fastgpt/global/core/dataset/type';
import DeleteIcon from '@fastgpt/web/components/common/Icon/delete';
import { defaultCollectionDetail } from '@/web/core/dataset/constants';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import styles from './styles.module.scss';
import {
  DatasetDataIndexTypeEnum,
  getDatasetIndexMapData
} from '@fastgpt/global/core/dataset/data/constants';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import MyImage from '@/components/MyImage/index';

export type InputDataType = {
  q: string;
  a: string;
  imagePreivewUrl?: string;
  indexes: (Omit<DatasetDataIndexItemType, 'dataId'> & {
    dataId?: string; // pg data id
    fold: boolean;
  })[];
};

enum TabEnum {
  chunk = 'chunk',
  qa = 'qa',
  image = 'image'
}

const RequiredFieldLabel = ({ children, ...props }: FlexProps & { children: React.ReactNode }) => (
  <Flex
    alignItems={'center'}
    gap={'4px'}
    w={'160px'}
    color={'#24282C'}
    fontSize={'14px'}
    lineHeight={'20px'}
    fontWeight={'500'}
    letterSpacing={'0.1px'}
    flexShrink={0}
    {...props}
  >
    <Box as="span" color={'#D92D20'}>
      *
    </Box>
    <Box as="span">{children}</Box>
  </Flex>
);

const sortIndexesForDisplay = (indexes: InputDataType['indexes'] = []) => {
  const getOrder = (index: InputDataType['indexes'][number]) => {
    if (index.type === DatasetDataIndexTypeEnum.default) return 1;
    return 0;
  };

  return [...indexes].sort((a, b) => getOrder(a) - getOrder(b));
};

const formatIndexesForForm = (indexes: DatasetDataIndexItemType[] = []) =>
  sortIndexesForDisplay(
    indexes.map((item) => ({
      ...item,
      fold: true
    }))
  );

const InputDataModal = ({
  collectionId,
  dataId,
  defaultValue,
  onClose,
  onSuccess
}: {
  collectionId: string;
  dataId?: string;
  defaultValue?: { q?: string; a?: string; imagePreivewUrl?: string };
  onClose: () => void;
  onSuccess: (data: InputDataType & { dataId: string }) => void;
}) => {
  const { t } = useTranslation();
  const { embeddingModelList, defaultModels } = useSystemStore();

  const [currentTab, setCurrentTab] = useState<TabEnum>();

  const { register, handleSubmit, reset, control, watch, getValues } = useForm<InputDataType>();
  const {
    fields: indexes,
    prepend: prependIndexes,
    remove: removeIndexes,
    update: updateIndexes
  } = useFieldArray({
    control,
    name: 'indexes'
  });
  const imagePreivewUrl = watch('imagePreivewUrl');

  const refreshDataForm = useCallback(
    async (targetDataId: string) => {
      const latestData = await getDatasetDataItemById(targetDataId);
      const refreshedData = {
        dataId: targetDataId,
        q: latestData.q || '',
        a: latestData.a || '',
        imagePreivewUrl: latestData.imagePreivewUrl,
        indexes: formatIndexesForForm(latestData.indexes)
      };

      reset(refreshedData);
      return refreshedData;
    },
    [reset]
  );

  const { data: collection = defaultCollectionDetail, loading: initLoading } = useRequest(
    async () => {
      const [collection, dataItem] = await Promise.all([
        getDatasetCollectionById(collectionId),
        ...(dataId ? [getDatasetDataItemById(dataId)] : [])
      ]);

      if (dataItem) {
        setCurrentTab(dataItem?.a ? TabEnum.qa : TabEnum.chunk);
        reset({
          q: dataItem.q || '',
          a: dataItem.a || '',
          imagePreivewUrl: dataItem.imagePreivewUrl,
          indexes: formatIndexesForForm(dataItem.indexes)
        });
      } else if (defaultValue) {
        setCurrentTab(defaultValue?.a ? TabEnum.qa : TabEnum.chunk);
        reset({
          q: defaultValue.q || '',
          a: defaultValue.a || '',
          imagePreivewUrl: defaultValue.imagePreivewUrl
        });
      } else {
        setCurrentTab(TabEnum.chunk);
      }

      // Forcus reset to image tab
      if (collection.type === DatasetCollectionTypeEnum.images) {
        setCurrentTab(TabEnum.image);
      }
      return collection;
    },
    {
      manual: false,
      refreshDeps: [collectionId, dataId, defaultValue]
    }
  );

  // Import new data
  const { runAsync: sureImportData, loading: isImporting } = useRequest(
    async (e: InputDataType) => {
      const data = { ...e };

      const postData: any = {
        collectionId: collection._id,
        q: e.q,
        a: currentTab === TabEnum.qa ? e.a : '',
        // Contains no default index
        indexes: e.indexes?.filter((item) => !!item.text?.trim()) || []
      };

      const dataId = await postInsertData2Dataset(postData);

      return {
        ...data,
        dataId
      };
    },
    {
      refreshDeps: [currentTab],
      successToast: t('common:dataset.data.Input Success Tip'),
      onSuccess(e) {
        reset({
          ...e,
          q: '',
          a: '',
          indexes: []
        });

        onSuccess(e);
      },
      errorToast: t('dataset:common.error.unKnow')
    }
  );

  // Update data
  const { runAsync: onUpdateData, loading: isUpdating } = useRequest(
    async (e: InputDataType) => {
      if (!dataId) return Promise.reject(t('common:error.unKnow'));

      await putDatasetDataById({
        dataId,
        q: e.q,
        a: currentTab === TabEnum.qa ? e.a : ''
      });
      return refreshDataForm(dataId);
    },
    {
      refreshDeps: [currentTab, refreshDataForm],
      successToast: t('common:dataset.data.Update Success Tip'),
      onSuccess(data) {
        onSuccess(data);
      }
    }
  );

  const { runAsync: onSaveIndex, loading: isSavingIndex } = useRequest(
    async ({
      index,
      originalIndex
    }: {
      index: number;
      originalIndex: InputDataType['indexes'][number];
    }) => {
      const targetIndex = getValues().indexes[index];
      const text = targetIndex?.text?.trim() || '';
      const type = targetIndex?.type || DatasetDataIndexTypeEnum.custom;

      if (type === DatasetDataIndexTypeEnum.default) {
        return;
      }

      if (!text) {
        if (!targetIndex?.dataId) {
          removeIndexes(index);
        }
        return;
      }

      if (
        targetIndex?.dataId &&
        text === originalIndex.text?.trim() &&
        type === (originalIndex.type || DatasetDataIndexTypeEnum.custom)
      ) {
        return;
      }

      if (!dataId) return;

      if (targetIndex?.dataId) {
        await updateDatasetDataIndex({
          dataId,
          indexDataId: targetIndex.dataId,
          type,
          text
        });
      } else {
        await createDatasetDataIndex({
          dataId,
          type,
          text
        });
      }

      const refreshedData = await refreshDataForm(dataId);
      onSuccess(refreshedData);
    },
    {
      refreshDeps: [dataId, getValues, refreshDataForm, removeIndexes],
      successToast: t('common:update_success')
    }
  );

  const { runAsync: onDeleteIndex, loading: isDeletingIndex } = useRequest(
    async (index: number) => {
      if (!dataId) {
        removeIndexes(index);
        return;
      }

      const targetIndex = getValues().indexes[index];
      if (!targetIndex?.dataId) {
        removeIndexes(index);
        return;
      }

      await deleteDatasetDataIndex({
        dataId,
        indexDataId: targetIndex.dataId
      });

      const refreshedData = await refreshDataForm(dataId);
      onSuccess(refreshedData);
    },
    {
      refreshDeps: [dataId, getValues, refreshDataForm],
      successToast: t('common:delete_success')
    }
  );

  const maxToken = useMemo(() => {
    const vectorModel =
      embeddingModelList.find((item) => item.model === collection.dataset.vectorModel) ||
      defaultModels.embedding;

    return vectorModel?.maxToken || 2000;
  }, [collection.dataset.vectorModel, defaultModels.embedding, embeddingModelList]);

  const showTabs = currentTab === TabEnum.chunk || currentTab === TabEnum.qa;

  return (
    <MyModal
      isOpen={true}
      isCentered
      w={['calc(100vw - 32px)', '800px']}
      onClose={() => onClose()}
      closeOnOverlayClick={false}
      maxW={['calc(100vw - 32px)', '800px']}
      h={['auto', currentTab === TabEnum.image ? '584px' : '620px']}
      maxH={['90vh', 'calc(100vh - 48px)']}
      borderRadius={'10px'}
      bg={'white'}
      boxShadow={'0px 4px 10px rgba(19, 51, 107, 0.1), 0px 0px 1px rgba(19, 51, 107, 0.1)'}
      showCloseButton={false}
    >
      <MyBox
        display={'flex'}
        flexDir={'column'}
        isLoading={initLoading}
        position={'relative'}
        h={'100%'}
        p={[5, '32px']}
        overflow={'hidden'}
        gap={'24px'}
      >
        <Box
          className={'textEllipsis'}
          wordBreak={'break-all'}
          fontSize={['xl', '20px']}
          lineHeight={['28px', '26px']}
          w={'100%'}
          h={['auto', '26px']}
          fontWeight={'500'}
          letterSpacing={'0.15px'}
          color={'#000000'}
          whiteSpace={'nowrap'}
          overflow={'hidden'}
          textOverflow={'ellipsis'}
          flexShrink={0}
        >
          {collection.sourceName || t('common:unknow_source')}
        </Box>
        <MyIconButton
          icon={'close'}
          position={'absolute'}
          right={'8px'}
          top={'8px'}
          w={'36px'}
          h={'36px'}
          p={'4px'}
          borderRadius={'4px'}
          size={'20px'}
          color={'#000000'}
          hoverBg={'transparent'}
          zIndex={1}
          onClick={() => onClose()}
        />

        <Flex
          flexDir={'column'}
          gap={'24px'}
          w={'100%'}
          h={['auto', showTabs ? '506px' : '450px']}
          minH={0}
        >
          {showTabs && (
            <Flex h={'32px'} gap={'16px'} borderBottom={'1px solid #E8EBF0'} flexShrink={0}>
              {[
                { label: t('common:dataset_data_input_chunk'), value: TabEnum.chunk },
                { label: t('common:dataset_data_input_qa'), value: TabEnum.qa }
              ].map((item) => {
                const isActive = currentTab === item.value;
                return (
                  <Flex
                    key={item.value}
                    alignItems={'center'}
                    justifyContent={'center'}
                    h={'32px'}
                    px={'4px'}
                    borderBottom={isActive ? '1.5px solid #3370FF' : '1.5px solid transparent'}
                    color={isActive ? '#2B5FD9' : '#667085'}
                    fontSize={'16px'}
                    lineHeight={'24px'}
                    fontWeight={'500'}
                    letterSpacing={'0.15px'}
                    cursor={'pointer'}
                    onClick={() => setCurrentTab(item.value)}
                  >
                    {item.label}
                  </Flex>
                );
              })}
            </Flex>
          )}

          <Flex
            flex={'1 0 0'}
            h={['auto', '450px']}
            gap={'32px'}
            flexDir={['column', 'row']}
            minH={0}
          >
            {/* Data */}
            <Flex
              flexDir={'column'}
              h={'100%'}
              gap={'8px'}
              flex={'1 0 0'}
              w={['100%', 0]}
              overflow={['unset', 'auto']}
            >
              <Flex
                flexDir={'column'}
                flex={currentTab === TabEnum.image ? '0 0 201px' : '1 0 0'}
                h={currentTab === TabEnum.image ? '201px' : 0}
                minH={0}
                gap={'8px'}
              >
                {currentTab === TabEnum.image && (
                  <>
                    <RequiredFieldLabel h={'32px'} py={'6px'}>
                      {t('file:image')}
                    </RequiredFieldLabel>
                    <Box flex={'1 0 0'} h={0} w="100%">
                      <Box
                        height="100%"
                        position="relative"
                        border={'1px solid #E8EBF0'}
                        borderRadius={'6px'}
                        bg={'#FBFBFC'}
                        p={'8px'}
                      >
                        <MyImage
                          src={imagePreivewUrl}
                          h="100%"
                          w="100%"
                          objectFit="cover"
                          borderRadius={'2px'}
                          alt={t('file:Image_Preview')}
                        />
                      </Box>
                    </Box>
                  </>
                )}
                {(currentTab === TabEnum.chunk || currentTab === TabEnum.qa) && (
                  <>
                    <RequiredFieldLabel h={'20px'}>
                      {currentTab === TabEnum.chunk
                        ? t('common:dataset_data_input_chunk_content')
                        : t('common:dataset_data_input_q')}
                    </RequiredFieldLabel>

                    <Textarea
                      resize={'both'}
                      className={styles.scrollbar}
                      flex={'1 0 0'}
                      tabIndex={1}
                      _focus={{
                        borderColor: 'primary.500',
                        boxShadow: '0px 0px 0px 2.4px rgba(51, 112, 255, 0.15)',
                        bg: 'white'
                      }}
                      bg={'white'}
                      borderRadius={'6px'}
                      borderColor={'#E8EBF0'}
                      p={'8px 12px'}
                      color={'#111824'}
                      fontSize={'12px'}
                      lineHeight={'16px'}
                      {...register(`q`, {
                        required: true
                      })}
                    />
                  </>
                )}
              </Flex>
              {currentTab === TabEnum.qa && (
                <Flex flexDir={'column'} flex={'1 0 0'} h={0} minH={0} gap={'8px'}>
                  <RequiredFieldLabel h={'20px'}>
                    {t('common:dataset_data_input_a')}
                  </RequiredFieldLabel>
                  <Textarea
                    resize={'both'}
                    className={styles.scrollbar}
                    flex={'1 0 0'}
                    tabIndex={1}
                    bg={'white'}
                    borderRadius={'6px'}
                    border={'1px solid #E8EBF0'}
                    p={'8px 12px'}
                    color={'#111824'}
                    fontSize={'12px'}
                    lineHeight={'16px'}
                    {...register('a', { required: true })}
                  />
                </Flex>
              )}
              {currentTab === TabEnum.image && (
                <Flex flexDir={'column'} flex={'1 0 0'} h={0} minH={0} gap={'8px'}>
                  <RequiredFieldLabel h={'32px'} py={'6px'}>
                    {t('file:image_description')}
                  </RequiredFieldLabel>
                  <Textarea
                    resize={'both'}
                    placeholder={t('file:image_description_tip')}
                    className={styles.scrollbar}
                    flex={'1 0 0'}
                    tabIndex={1}
                    bg={'white'}
                    borderRadius={'6px'}
                    border={'1px solid #E8EBF0'}
                    p={'8px 12px'}
                    color={'#111824'}
                    fontSize={'12px'}
                    lineHeight={'16px'}
                    {...register('q', {
                      required: true
                    })}
                  />
                </Flex>
              )}
              <Button
                h={'32px'}
                minH={'32px'}
                w={'100%'}
                bg={'#F0F1F6'}
                color={'#2B5FD9'}
                borderRadius={'6px'}
                fontSize={'12px'}
                lineHeight={'16px'}
                fontWeight={'500'}
                letterSpacing={'0.5px'}
                _hover={{ bg: '#E8EBF0' }}
                rightIcon={<MyIcon name={'common/rightArrowLight'} w={'16px'} color={'#3370FF'} />}
                isDisabled={!collection.permission.hasWritePer}
                isLoading={isImporting || isUpdating}
                onClick={handleSubmit((data) =>
                  dataId ? onUpdateData(data) : sureImportData(data)
                )}
              >
                {t('dataset:generate_index')}
              </Button>
            </Flex>
            {/* Index */}
            <Flex flexDir={'column'} flex={'1 0 0'} w={['100%', 0]} minH={0}>
              <Flex
                alignItems={'center'}
                justifyContent={'space-between'}
                h={'20px'}
                mb={'8px'}
                flexShrink={0}
              >
                <FormLabel color={'#111824'} fontSize={'14px'} lineHeight={'20px'}>
                  {t('common:dataset.data.edit.Index', {
                    amount: indexes.length
                  })}
                </FormLabel>
                <Button
                  variant={'whiteBase'}
                  size={'sm'}
                  h={'30px'}
                  px={'14px'}
                  py={'7px'}
                  border={'1px solid #DFE2EA'}
                  borderRadius={'6px'}
                  boxShadow={
                    '0px 1px 2px rgba(19, 51, 107, 0.05), 0px 0px 1px rgba(19, 51, 107, 0.08)'
                  }
                  onClick={() =>
                    prependIndexes({
                      type: DatasetDataIndexTypeEnum.custom,
                      text: '',
                      fold: false
                    })
                  }
                >
                  <Flex
                    alignItems={'center'}
                    fontSize={'12px'}
                    lineHeight={'16px'}
                    color={'#485264'}
                  >
                    <MyIcon name={'common/addLight'} w={'1rem'} mr={'6px'} color={'#485264'} />
                    {t('common:add_new')}
                  </Flex>
                </Button>
              </Flex>

              <Box flex={'1 0 0'} h={0} minH={0} overflow={['unset', 'auto']}>
                <VStack spacing={'8px'} alignItems={'stretch'}>
                  {indexes?.map((index, i) => {
                    const data = getDatasetIndexMapData(index.type);
                    const canFoldIndex = indexes.length > 1;
                    return (
                      <Box
                        key={index.dataId || i}
                        p={'16px'}
                        borderRadius={'8px'}
                        border={'1px solid #E8EBF0'}
                        bg={'#FBFBFC'}
                        w={'100%'}
                        minH={'104px'}
                        _hover={{
                          '& .delete': {
                            display: 'block'
                          }
                        }}
                      >
                        {/* Header */}
                        <Flex mb={'8px'} alignItems={'center'} h={'24px'}>
                          <FormLabel
                            flex={'1 0 0'}
                            color={'#111824'}
                            fontSize={'14px'}
                            lineHeight={'20px'}
                          >
                            {t(data.label)}
                          </FormLabel>
                          {/* Delete */}
                          {index.type !== DatasetDataIndexTypeEnum.default && (
                            <Flex
                              className={'delete'}
                              display={'none'}
                              borderRight={'base'}
                              pr={3}
                              mr={2}
                            >
                              <DeleteIcon
                                onClick={() => {
                                  if (isDeletingIndex) return;
                                  onDeleteIndex(i);
                                }}
                              />
                            </Flex>
                          )}
                          {canFoldIndex && (
                            <MyIconButton
                              icon={index.fold ? 'core/chat/chevronDown' : 'core/chat/chevronUp'}
                              w={'24px'}
                              h={'24px'}
                              color={'#667085'}
                              hoverBg={'transparent'}
                              onClick={() => {
                                updateIndexes(i, { ...index, fold: !index.fold });
                              }}
                            />
                          )}
                        </Flex>
                        {/* Content */}
                        <DataIndexTextArea
                          disabled={index.type === 'default'}
                          index={i}
                          value={index.text}
                          displayValue={index.text}
                          isFolder={index.fold && canFoldIndex}
                          maxToken={maxToken}
                          register={register}
                          onFocus={() => {
                            updateIndexes(i, { ...index, fold: false });
                          }}
                          onBlur={() => {
                            onSaveIndex({ index: i, originalIndex: index });
                          }}
                        />
                      </Box>
                    );
                  })}
                </VStack>
              </Box>
            </Flex>
          </Flex>
        </Flex>
      </MyBox>
    </MyModal>
  );
};

export default React.memo(InputDataModal);

const textareaMinH = '40px';
const DataIndexTextArea = ({
  value,
  displayValue,
  index,
  maxToken,
  register,
  disabled,
  isFolder,
  onFocus,
  onBlur: onSaveBlur
}: {
  value: string;
  displayValue?: string;
  index: number;
  maxToken: number;
  register: UseFormRegister<InputDataType>;
  disabled?: boolean;
  isFolder: boolean;
  onFocus: () => void;
  onBlur: () => void;
}) => {
  const { t } = useTranslation();
  const TextareaDom = useRef<HTMLTextAreaElement | null>(null);
  const {
    ref: TextareaRef,
    required,
    name,
    onChange: onTextChange,
    onBlur
  } = register(`indexes.${index}.text`, { required: true });

  useEffect(() => {
    if (TextareaDom.current) {
      TextareaDom.current.style.height = textareaMinH;
      TextareaDom.current.style.height = `${TextareaDom.current.scrollHeight + 5}px`;
    }
  }, []);
  const autoHeight = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (e.target) {
      e.target.style.height = textareaMinH;
      e.target.style.height = `${e.target.scrollHeight + 5}px`;
    }
  }, []);

  const onclickMark = () => {
    TextareaDom?.current?.focus();
    onFocus();
  };

  return (
    <Box
      pos={'relative'}
      {...(isFolder
        ? {
            maxH: '40px',
            overflow: 'hidden'
          }
        : {
            maxH: 'auto'
          })}
    >
      {disabled ? (
        <Box
          fontSize={'12px'}
          lineHeight={'16px'}
          color={'#485264'}
          letterSpacing={'0.004em'}
          whiteSpace={'pre-wrap'}
        >
          {displayValue ?? value}
        </Box>
      ) : (
        <Textarea
          maxLength={maxToken}
          borderColor={'transparent'}
          className={styles.scrollbar}
          minH={'32px'}
          px={0}
          pt={0}
          isRequired={required}
          whiteSpace={'pre-wrap'}
          resize={'none'}
          fontSize={'12px'}
          lineHeight={'16px'}
          color={'#667085'}
          letterSpacing={'0.004em'}
          _focus={{
            px: 3,
            py: 1,
            borderColor: 'primary.500',
            boxShadow: '0px 0px 0px 2.4px rgba(51, 112, 255, 0.15)',
            bg: 'white'
          }}
          placeholder={t('common:dataset.data.Index Placeholder')}
          ref={(e) => {
            if (e) TextareaDom.current = e;
            TextareaRef(e);
          }}
          required
          name={name}
          onChange={(e) => {
            autoHeight(e);
            onTextChange(e);
          }}
          onFocus={autoHeight}
          onBlur={(e) => {
            onBlur(e);
            onSaveBlur();
          }}
        />
      )}
      {isFolder && (
        <Box
          pos={'absolute'}
          bottom={0}
          left={0}
          right={0}
          top={0}
          bg={'linear-gradient(182deg, rgba(251, 251, 252, 0.00) 1.76%, #FBFBFC 84.07%)'}
          borderRadius={'6px'}
          {...(disabled
            ? {}
            : {
                cursor: 'pointer',
                onClick: onclickMark
              })}
        />
      )}
    </Box>
  );
};
