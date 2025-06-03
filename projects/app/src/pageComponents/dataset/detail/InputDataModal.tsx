import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Flex, Button, Textarea, ModalFooter, HStack, VStack, Image } from '@chakra-ui/react';
import type { UseFormRegister } from 'react-hook-form';
import { useFieldArray, useForm } from 'react-hook-form';
import {
  postInsertData2Dataset,
  putDatasetDataById,
  getDatasetCollectionById,
  getDatasetDataItemById
} from '@/web/core/dataset/api';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyModal from '@fastgpt/web/components/common/MyModal';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useTranslation } from 'next-i18next';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { getCollectionIcon } from '@fastgpt/global/core/dataset/utils';
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
import FillRowTabs from '@fastgpt/web/components/common/Tabs/FillRowTabs';
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

  const { register, handleSubmit, reset, control, watch } = useForm<InputDataType>();
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

  const { data: collection = defaultCollectionDetail } = useRequest2(
    () => getDatasetCollectionById(collectionId),
    {
      manual: false,
      refreshDeps: [collectionId],
      onSuccess(res) {
        if (res.type === DatasetCollectionTypeEnum.images) {
          setCurrentTab(TabEnum.image);
        } else {
          setCurrentTab(TabEnum.chunk);
        }
      }
    }
  );

  // Get data
  const { loading: isFetchingData } = useRequest2(
    async () => {
      if (dataId) return getDatasetDataItemById(dataId);
      return null;
    },
    {
      manual: false,
      refreshDeps: [dataId],
      onSuccess(res) {
        if (res) {
          reset({
            q: res.q || '',
            a: res.a || '',
            imagePreivewUrl: res.imagePreivewUrl,
            indexes: res.indexes.map((item) => ({
              ...item,
              fold: true
            }))
          });
        } else if (defaultValue) {
          reset({
            q: defaultValue.q || '',
            a: defaultValue.a || '',
            imagePreivewUrl: defaultValue.imagePreivewUrl
          });
        }
      },
      onError(err) {
        onClose();
      }
    }
  );

  // Import new data
  const { runAsync: sureImportData, loading: isImporting } = useRequest2(
    async (e: InputDataType) => {
      const data = { ...e };

      const postData: any = {
        collectionId: collection._id,
        q: e.q,
        a: currentTab === TabEnum.qa ? e.a : '',
        // Contains no default index
        indexes: e.indexes.filter((item) => !!item.text?.trim())
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
  const { runAsync: onUpdateData, loading: isUpdating } = useRequest2(
    async (e: InputDataType) => {
      if (!dataId) return Promise.reject(t('common:error.unKnow'));

      const updateData: any = {
        dataId,
        q: e.q,
        a: currentTab === TabEnum.qa ? e.a : '',
        indexes: e.indexes.filter((item) => !!item.text?.trim())
      };

      await putDatasetDataById(updateData);

      return {
        dataId,
        ...e
      };
    },
    {
      refreshDeps: [currentTab],
      successToast: t('common:dataset.data.Update Success Tip'),
      onSuccess(data) {
        onSuccess(data);
        onClose();
      }
    }
  );

  const isLoading = isFetchingData;

  const icon = useMemo(
    () => getCollectionIcon({ type: collection.type, name: collection.sourceName }),
    [collection]
  );

  const maxToken = useMemo(() => {
    const vectorModel =
      embeddingModelList.find((item) => item.model === collection.dataset.vectorModel) ||
      defaultModels.embedding;

    return vectorModel?.maxToken || 2000;
  }, [collection.dataset.vectorModel, defaultModels.embedding, embeddingModelList]);

  return (
    <MyModal
      isOpen={true}
      isCentered
      w={['20rem', '64rem']}
      onClose={() => onClose()}
      closeOnOverlayClick={false}
      maxW={'1440px'}
      h={'46.25rem'}
      title={
        <Flex ml={-3}>
          <MyIcon name={icon as any} w={['16px', '20px']} mr={2} />
          <Box
            className={'textEllipsis'}
            wordBreak={'break-all'}
            fontSize={'md'}
            maxW={['200px', '50vw']}
            fontWeight={'500'}
            color={'myGray.900'}
            whiteSpace={'nowrap'}
            overflow={'hidden'}
            textOverflow={'ellipsis'}
          >
            {collection.sourceName || t('common:unknow_source')}
          </Box>
        </Flex>
      }
    >
      <MyBox
        display={'flex'}
        flexDir={'column'}
        isLoading={isLoading}
        h={'100%'}
        py={[6, '1.5rem']}
      >
        {/* Tab */}
        <Box px={[5, '3.25rem']}>
          {(currentTab === TabEnum.chunk || currentTab === TabEnum.qa) && (
            <FillRowTabs
              list={[
                { label: t('common:dataset_data_input_chunk'), value: TabEnum.chunk },
                { label: t('common:dataset_data_input_qa'), value: TabEnum.qa }
              ]}
              py={1}
              value={currentTab}
              onChange={(e) => {
                setCurrentTab(e);
              }}
            />
          )}
        </Box>

        <Flex flex={'1 0 0'} h={['auto', '0']} gap={6} flexDir={['column', 'row']} px={[5, '0']}>
          {/* Data */}
          <Flex
            pt={4}
            pl={[0, '3.25rem']}
            flexDir={'column'}
            h={'100%'}
            gap={3}
            flex={'1 0 0'}
            w={['100%', 0]}
            overflow={['unset', 'auto']}
          >
            <Flex flexDir={'column'} flex={'1 0 0'} h={0}>
              {currentTab === TabEnum.image && (
                <>
                  <FormLabel required mb={1} h={'30px'}>
                    {t('file:image')}
                  </FormLabel>
                  <Box flex={'1 0 0'} h={0} w="100%">
                    <Box height="100%" position="relative" border="base" borderRadius={'md'} p={1}>
                      <MyImage
                        src={imagePreivewUrl}
                        h="100%"
                        w="100%"
                        objectFit="contain"
                        alt={t('file:Image_Preview')}
                      />
                    </Box>
                  </Box>
                </>
              )}
              {(currentTab === TabEnum.chunk || currentTab === TabEnum.qa) && (
                <>
                  <FormLabel required mb={1} h={'30px'}>
                    {currentTab === TabEnum.chunk
                      ? t('common:dataset_data_input_chunk_content')
                      : t('common:dataset_data_input_q')}
                  </FormLabel>

                  <Textarea
                    resize={'none'}
                    className={styles.scrollbar}
                    flex={'1 0 0'}
                    tabIndex={1}
                    _focus={{
                      borderColor: 'primary.500',
                      boxShadow: '0px 0px 0px 2.4px rgba(51, 112, 255, 0.15)',
                      bg: 'white'
                    }}
                    bg={'myGray.25'}
                    borderRadius={'md'}
                    borderColor={'myGray.200'}
                    {...register(`q`, {
                      required: true
                    })}
                  />
                </>
              )}
            </Flex>
            {currentTab === TabEnum.qa && (
              <Flex flexDir={'column'} flex={'1 0 0'}>
                <FormLabel required mb={1}>
                  {t('common:dataset_data_input_a')}
                </FormLabel>
                <Textarea
                  resize={'none'}
                  className={styles.scrollbar}
                  flex={'1 0 0'}
                  tabIndex={1}
                  bg={'myGray.25'}
                  borderRadius={'md'}
                  border={'1.5px solid '}
                  borderColor={'myGray.200'}
                  {...register('a', { required: true })}
                />
              </Flex>
            )}
            {currentTab === TabEnum.image && (
              <Flex flexDir={'column'} flex={'1 0 0'}>
                <FormLabel required mb={1}>
                  {t('file:image_description')}
                </FormLabel>
                <Textarea
                  resize={'none'}
                  placeholder={t('file:image_description_tip')}
                  className={styles.scrollbar}
                  flex={'1 0 0'}
                  tabIndex={1}
                  bg={'myGray.25'}
                  borderRadius={'md'}
                  border={'1.5px solid '}
                  borderColor={'myGray.200'}
                  {...register('q', {
                    required: true
                  })}
                />
              </Flex>
            )}
          </Flex>
          {/* Index */}
          <Box
            pt={4}
            pr={[0, '3.25rem']}
            flex={'1 0 0'}
            w={['100%', 0]}
            overflow={['unset', 'auto']}
          >
            <Flex alignItems={'flex-start'} justifyContent={'space-between'} h={'30px'}>
              <FormLabel>
                {t('common:dataset.data.edit.Index', {
                  amount: indexes.length
                })}
              </FormLabel>
              <Button
                variant={'whiteBase'}
                size={'sm'}
                p={0}
                transform={'translateY(-6px)'}
                onClick={() =>
                  prependIndexes({
                    type: DatasetDataIndexTypeEnum.custom,
                    text: '',
                    fold: false
                  })
                }
              >
                <Flex px={'0.62rem'} py={2}>
                  <MyIcon name={'common/addLight'} w={'1rem'} mr={'0.38rem'} />
                  {t('common:add_new')}
                </Flex>
              </Button>
            </Flex>

            <VStack>
              {indexes?.map((index, i) => {
                const data = getDatasetIndexMapData(index.type);
                return (
                  <Box
                    key={index.dataId || i}
                    p={4}
                    borderRadius={'md'}
                    border={'base'}
                    bg={'myGray.25'}
                    w={'100%'}
                    _hover={{
                      '& .delete': {
                        display: 'block'
                      }
                    }}
                  >
                    {/* Header */}
                    <Flex mb={2} alignItems={'center'}>
                      <FormLabel flex={'1 0 0'}>{t(data.label)}</FormLabel>
                      {/* Delete */}
                      {index.type !== 'default' && (
                        <HStack className={'delete'} borderRight={'base'} pr={3} mr={2}>
                          <DeleteIcon
                            onClick={() => {
                              removeIndexes(i);
                            }}
                          />
                        </HStack>
                      )}
                      {indexes.length > 1 && (
                        <MyIconButton
                          icon={index.fold ? 'core/chat/chevronDown' : 'core/chat/chevronUp'}
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
                      isFolder={index.fold && indexes.length > 1}
                      maxToken={maxToken}
                      register={register}
                      onFocus={() => {
                        updateIndexes(i, { ...index, fold: false });
                      }}
                    />
                  </Box>
                );
              })}
            </VStack>
          </Box>
        </Flex>

        <ModalFooter px={[5, '3.25rem']} py={0} pt={4}>
          <MyTooltip
            label={collection.permission.hasWritePer ? '' : t('common:dataset.data.Can not edit')}
          >
            <Button
              isDisabled={!collection.permission.hasWritePer}
              isLoading={isImporting || isUpdating}
              // @ts-ignore
              onClick={handleSubmit(dataId ? onUpdateData : sureImportData)}
            >
              {dataId ? t('common:confirm_update') : t('common:comfirm_import')}
            </Button>
          </MyTooltip>
        </ModalFooter>
      </MyBox>
    </MyModal>
  );
};

export default React.memo(InputDataModal);

const textareaMinH = '40px';
const DataIndexTextArea = ({
  value,
  index,
  maxToken,
  register,
  disabled,
  isFolder,
  onFocus
}: {
  value: string;
  index: number;
  maxToken: number;
  register: UseFormRegister<InputDataType>;
  disabled?: boolean;
  isFolder: boolean;
  onFocus: () => void;
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
            maxH: '50px',
            overflow: 'hidden'
          }
        : {
            maxH: 'auto'
          })}
    >
      {disabled ? (
        <Box fontSize={'sm'} color={'myGray.500'} whiteSpace={'pre-wrap'}>
          {value}
        </Box>
      ) : (
        <Textarea
          maxLength={maxToken}
          borderColor={'transparent'}
          className={styles.scrollbar}
          minH={textareaMinH}
          px={0}
          pt={0}
          isRequired={required}
          whiteSpace={'pre-wrap'}
          resize={'none'}
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
          onBlur={onBlur}
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
