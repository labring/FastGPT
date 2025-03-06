import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Flex, Button, Textarea } from '@chakra-ui/react';
import {
  FieldArrayWithId,
  UseFieldArrayRemove,
  UseFormRegister,
  useFieldArray,
  useForm
} from 'react-hook-form';
import {
  postInsertData2Dataset,
  putDatasetDataById,
  getDatasetCollectionById,
  getDatasetDataItemById
} from '@/web/core/dataset/api';
import { useToast } from '@fastgpt/web/hooks/useToast';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyModal from '@fastgpt/web/components/common/MyModal';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'next-i18next';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { getSourceNameIcon } from '@fastgpt/global/core/dataset/utils';
import { DatasetDataIndexItemType } from '@fastgpt/global/core/dataset/type';
import DeleteIcon from '@fastgpt/web/components/common/Icon/delete';
import { defaultCollectionDetail } from '@/web/core/dataset/constants';
import { getDocPath } from '@/web/common/system/doc';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import LightRowTabs from '@fastgpt/web/components/common/Tabs/LightRowTabs';
import styles from './styles.module.scss';
import {
  DatasetDataIndexTypeEnum,
  getDatasetIndexMapData
} from '@fastgpt/global/core/dataset/data/constants';

export type InputDataType = {
  q: string;
  a: string;
  indexes: (Omit<DatasetDataIndexItemType, 'dataId'> & {
    dataId?: string; // pg data id
  })[];
};

enum TabEnum {
  content = 'content',
  index = 'index'
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
  defaultValue?: { q: string; a?: string };
  onClose: () => void;
  onSuccess: (data: InputDataType & { dataId: string }) => void;
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [currentTab, setCurrentTab] = useState(TabEnum.content);
  const { embeddingModelList, defaultModels } = useSystemStore();

  const { register, handleSubmit, reset, control } = useForm<InputDataType>();
  const {
    fields: indexes,
    append: appendIndexes,
    remove: removeIndexes
  } = useFieldArray({
    control,
    name: 'indexes'
  });

  const tabList = [
    {
      label: (
        <Flex align={'center'}>
          <Box>{t('common:dataset.data.edit.divide_content')}</Box>
        </Flex>
      ),
      value: TabEnum.content
    },
    {
      label: (
        <Flex align={'center'}>
          <Box>{t('common:dataset.data.edit.Index', { amount: indexes.length })}</Box>
          <MyTooltip label={t('common:core.app.tool_label.view_doc')}>
            <MyIcon
              name={'book'}
              w={'1rem'}
              mr={'0.38rem'}
              color={'myGray.500'}
              ml={1}
              onClick={() =>
                window.open(getDocPath('/docs/guide/knowledge_base/dataset_engine/'), '_blank')
              }
              _hover={{
                color: 'primary.600',
                cursor: 'pointer'
              }}
            />
          </MyTooltip>
        </Flex>
      ),
      value: TabEnum.index
    }
  ];

  const { data: collection = defaultCollectionDetail } = useQuery(
    ['loadCollectionId', collectionId],
    () => {
      return getDatasetCollectionById(collectionId);
    }
  );
  const { isFetching: isFetchingData } = useQuery(
    ['getDatasetDataItemById', dataId],
    () => {
      if (dataId) return getDatasetDataItemById(dataId);
      return null;
    },
    {
      onSuccess(res) {
        if (res) {
          reset({
            q: res.q,
            a: res.a,
            indexes: res.indexes
          });
        } else if (defaultValue) {
          reset({
            q: defaultValue.q,
            a: defaultValue.a
          });
        }
      },
      onError(err) {
        toast({
          status: 'error',
          title: t(getErrText(err) as any)
        });
        onClose();
      }
    }
  );

  const maxToken = useMemo(() => {
    const vectorModel =
      embeddingModelList.find((item) => item.model === collection.dataset.vectorModel) ||
      defaultModels.embedding;

    return vectorModel?.maxToken || 3000;
  }, [collection.dataset.vectorModel, defaultModels.embedding, embeddingModelList]);

  // import new data
  const { runAsync: sureImportData, loading: isImporting } = useRequest2(
    async (e: InputDataType) => {
      if (!e.q) {
        setCurrentTab(TabEnum.content);
        return Promise.reject(t('common:dataset.data.input is empty'));
      }

      const totalLength = e.q.length + (e.a?.length || 0);
      if (totalLength >= maxToken * 1.4) {
        return Promise.reject(t('common:core.dataset.data.Too Long'));
      }

      const data = { ...e };

      const dataId = await postInsertData2Dataset({
        collectionId: collection._id,
        q: e.q,
        a: e.a,
        // Contains no default index
        indexes: e.indexes
      });

      return {
        ...data,
        dataId
      };
    },
    {
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
      errorToast: t('common:common.error.unKnow')
    }
  );

  // update
  const { runAsync: onUpdateData, loading: isUpdating } = useRequest2(
    async (e: InputDataType) => {
      if (!dataId) return Promise.reject(t('common:common.error.unKnow'));

      // not exactly same
      await putDatasetDataById({
        dataId,
        ...e,
        indexes: e.indexes
      });

      return {
        dataId,
        ...e
      };
    },
    {
      successToast: t('common:dataset.data.Update Success Tip'),
      onSuccess(data) {
        onSuccess(data);
        onClose();
      }
    }
  );

  const isLoading = isFetchingData;

  const icon = useMemo(
    () => getSourceNameIcon({ sourceName: collection.sourceName, sourceId: collection.sourceId }),
    [collection]
  );

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
            {collection.sourceName || t('common:common.UnKnow Source')}
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
        px={[5, '3.25rem']}
      >
        <Flex justify={'space-between'} gap={4} w={'100%'}>
          <Flex justify={'space-between'} pb={4}>
            <LightRowTabs<TabEnum>
              list={tabList}
              p={0}
              value={currentTab}
              onChange={(e: TabEnum) => setCurrentTab(e)}
            />
          </Flex>
          {currentTab === TabEnum.index && (
            <Button
              variant={'whiteBase'}
              boxShadow={'1'}
              p={0}
              onClick={() =>
                appendIndexes({
                  type: DatasetDataIndexTypeEnum.custom,
                  text: ''
                })
              }
            >
              <Flex px={'0.62rem'} py={2}>
                <MyIcon name={'common/addLight'} w={'1rem'} mr={'0.38rem'} />
                {t('common:add_new')}
              </Flex>
            </Button>
          )}
        </Flex>
        <Box w={'100%'} flexGrow={1} overflow={'scroll'}>
          {currentTab === TabEnum.content && <InputTab maxToken={maxToken} register={register} />}
          {currentTab === TabEnum.index && (
            <DataIndex
              register={register}
              maxToken={maxToken}
              removeIndexes={removeIndexes}
              indexes={indexes}
            />
          )}
        </Box>

        <Flex justifyContent={'flex-end'} pt={8} pb={[8, 0]} h={[24, 16]}>
          <MyTooltip
            label={collection.permission.hasWritePer ? '' : t('common:dataset.data.Can not edit')}
          >
            <Button
              isDisabled={!collection.permission.hasWritePer}
              isLoading={isImporting || isUpdating}
              // @ts-ignore
              onClick={handleSubmit(dataId ? onUpdateData : sureImportData)}
            >
              {dataId ? t('common:common.Confirm Update') : t('common:common.Confirm Import')}
            </Button>
          </MyTooltip>
        </Flex>
      </MyBox>
    </MyModal>
  );
};

export default React.memo(InputDataModal);

const InputTab = ({
  maxToken,
  register
}: {
  maxToken: number;
  register: UseFormRegister<InputDataType>;
}) => {
  const { t } = useTranslation();

  return (
    <>
      <Flex h={'100%'} gap={6} flexDir={['column', 'row']} w={'100%'}>
        <Flex flexDir={'column'} flex={1}>
          <Flex mb={2} fontWeight={'medium'} fontSize={'sm'} alignItems={'center'} h={8}>
            <Box color={'red.600'}>*</Box>
            <Box color={'myGray.900'}>{t('common:core.dataset.data.Main Content')}</Box>
            <QuestionTip label={t('common:core.dataset.data.Data Content Tip')} ml={1} />
          </Flex>
          <Box
            borderRadius={'md'}
            border={'1.5px solid var(--Gray-Modern-200, #E8EBF0)'}
            bg={'myGray.25'}
            flex={1}
          >
            <Textarea
              resize={'none'}
              placeholder={t('core.dataset.data.Data Content Placeholder', { maxToken })}
              className={styles.scrollbar}
              maxLength={maxToken}
              h={'100%'}
              tabIndex={1}
              _focus={{
                borderColor: 'primary.500',
                boxShadow: '0px 0px 0px 2.4px rgba(51, 112, 255, 0.15)',
                bg: 'white'
              }}
              borderColor={'transparent'}
              bg={'myGray.25'}
              {...register(`q`, {
                required: true
              })}
            />
          </Box>
        </Flex>
        <Flex flex={1} flexDir={'column'}>
          <Flex mb={2} fontWeight={'medium'} fontSize={'sm'} alignItems={'center'} h={8}>
            <Box color={'myGray.900'}>{t('common:core.dataset.data.Auxiliary Data')}</Box>
            <QuestionTip label={t('common:core.dataset.data.Auxiliary Data Tip')} ml={1} />
          </Flex>
          <Box
            borderRadius={'md'}
            border={'1.5px solid '}
            borderColor={'myGray.200'}
            bg={'myGray.25'}
            flex={1}
          >
            <Textarea
              resize={'none'}
              placeholder={t('core.dataset.data.Auxiliary Data Placeholder', {
                maxToken: maxToken * 1.5
              })}
              className={styles.scrollbar}
              borderColor={'transparent'}
              h={'100%'}
              tabIndex={1}
              bg={'myGray.25'}
              maxLength={maxToken * 1.5}
              {...register('a')}
            />
          </Box>
        </Flex>
      </Flex>
    </>
  );
};

const DataIndex = ({
  maxToken,
  register,
  indexes,
  removeIndexes
}: {
  maxToken: number;
  register: UseFormRegister<InputDataType>;
  indexes: FieldArrayWithId<InputDataType, 'indexes', 'id'>[];
  removeIndexes: UseFieldArrayRemove;
}) => {
  const { t } = useTranslation();

  return (
    <>
      <Flex mt={3} gap={3} flexDir={'column'}>
        {indexes?.map((index, i) => {
          const data = getDatasetIndexMapData(index.type);
          return (
            <Box
              key={index.dataId || i}
              p={4}
              borderRadius={'md'}
              border={'1.5px solid var(--Gray-Modern-200, #E8EBF0)'}
              bg={'myGray.25'}
              _hover={{
                '& .delete': {
                  display: 'block'
                }
              }}
            >
              <Flex mb={2}>
                <Box flex={1} fontWeight={'medium'} fontSize={'sm'} color={'myGray.900'}>
                  {t(data.label)}
                </Box>
                {index.type !== 'default' && (
                  <DeleteIcon
                    onClick={() => {
                      removeIndexes(i);
                    }}
                  />
                )}
              </Flex>
              <DataIndexTextArea
                disabled={index.type === 'default'}
                index={i}
                value={index.text}
                maxToken={maxToken}
                register={register}
              />
            </Box>
          );
        })}
      </Flex>
    </>
  );
};

const textareaMinH = '40px';
const DataIndexTextArea = ({
  value,
  index,
  maxToken,
  register,
  disabled
}: {
  value: string;
  index: number;
  maxToken: number;
  register: UseFormRegister<InputDataType>;
  disabled?: boolean;
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

  return disabled ? (
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
  );
};
