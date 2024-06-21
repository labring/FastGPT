import React, { useMemo, useState } from 'react';
import { Box, Flex, Button, Textarea, useTheme, Grid, HStack } from '@chakra-ui/react';
import { UseFormRegister, useFieldArray, useForm } from 'react-hook-form';
import {
  postInsertData2Dataset,
  putDatasetDataById,
  delOneDatasetDataById,
  getDatasetCollectionById,
  getDatasetDataItemById
} from '@/web/core/dataset/api';
import { useToast } from '@fastgpt/web/hooks/useToast';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyModal from '@fastgpt/web/components/common/MyModal';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'next-i18next';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { getDefaultIndex } from '@fastgpt/global/core/dataset/utils';
import { DatasetDataIndexItemType } from '@fastgpt/global/core/dataset/type';
import SideTabs from '@/components/SideTabs';
import DeleteIcon from '@fastgpt/web/components/common/Icon/delete';
import { defaultCollectionDetail } from '@/web/core/dataset/constants';
import { getDocPath } from '@/web/common/system/doc';
import RawSourceBox from '@/components/core/dataset/RawSourceBox';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';

export type InputDataType = {
  q: string;
  a: string;
  indexes: (Omit<DatasetDataIndexItemType, 'dataId'> & {
    dataId?: string; // pg data id
  })[];
};

enum TabEnum {
  content = 'content',
  index = 'index',
  delete = 'delete',
  doc = 'doc'
}

const InputDataModal = ({
  collectionId,
  dataId,
  defaultValue,
  onClose,
  onSuccess,
  onDelete
}: {
  collectionId: string;
  dataId?: string;
  defaultValue?: { q: string; a?: string };
  onClose: () => void;
  onSuccess: (data: InputDataType & { dataId: string }) => void;
  onDelete?: () => void;
}) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const { toast } = useToast();
  const [currentTab, setCurrentTab] = useState(TabEnum.content);
  const { vectorModelList } = useSystemStore();

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
    { label: t('dataset.data.edit.Content'), value: TabEnum.content, icon: 'common/overviewLight' },
    {
      label: t('dataset.data.edit.Index', { amount: indexes.length }),
      value: TabEnum.index,
      icon: 'kbTest'
    },
    ...(dataId
      ? [{ label: t('dataset.data.edit.Delete'), value: TabEnum.delete, icon: 'delete' }]
      : []),
    { label: t('dataset.data.edit.Course'), value: TabEnum.doc, icon: 'common/courseLight' }
  ];

  const { ConfirmModal, openConfirm } = useConfirm({
    content: t('dataset.data.Delete Tip'),
    type: 'delete'
  });

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
          title: t(getErrText(err))
        });
        onClose();
      }
    }
  );

  const maxToken = useMemo(() => {
    const vectorModel =
      vectorModelList.find((item) => item.model === collection.datasetId.vectorModel) ||
      vectorModelList[0];

    return vectorModel?.maxToken || 3000;
  }, [collection.datasetId.vectorModel, vectorModelList]);

  // import new data
  const { mutate: sureImportData, isLoading: isImporting } = useRequest({
    mutationFn: async (e: InputDataType) => {
      if (!e.q) {
        setCurrentTab(TabEnum.content);
        return Promise.reject(t('dataset.data.input is empty'));
      }

      const totalLength = e.q.length + (e.a?.length || 0);
      if (totalLength >= maxToken * 1.4) {
        return Promise.reject(t('core.dataset.data.Too Long'));
      }

      const data = { ...e };

      const dataId = await postInsertData2Dataset({
        collectionId: collection._id,
        q: e.q,
        a: e.a,
        // remove dataId
        indexes:
          e.indexes?.map((index) => ({
            ...index,
            dataId: undefined
          })) || []
      });

      return {
        ...data,
        dataId
      };
    },
    successToast: t('dataset.data.Input Success Tip'),
    onSuccess(e) {
      reset({
        ...e,
        q: '',
        a: '',
        indexes: []
      });

      onSuccess(e);
    },
    errorToast: t('common.error.unKnow')
  });
  // update
  const { mutate: onUpdateData, isLoading: isUpdating } = useRequest({
    mutationFn: async (e: InputDataType) => {
      if (!dataId) return e;

      // not exactly same
      await putDatasetDataById({
        id: dataId,
        ...e,
        indexes:
          e.indexes?.map((index) =>
            index.defaultIndex ? getDefaultIndex({ q: e.q, a: e.a, dataId: index.dataId }) : index
          ) || []
      });

      return {
        dataId,
        ...e
      };
    },
    successToast: t('dataset.data.Update Success Tip'),
    errorToast: t('common.error.unKnow'),
    onSuccess(data) {
      onSuccess(data);
      onClose();
    }
  });
  // delete
  const { mutate: onDeleteData, isLoading: isDeleting } = useRequest({
    mutationFn: () => {
      if (!onDelete || !dataId) return Promise.resolve(null);
      return delOneDatasetDataById(dataId);
    },
    onSuccess() {
      if (!onDelete) return;
      onDelete();
      onClose();
    },
    successToast: t('common.Delete Success'),
    errorToast: t('common.error.unKnow')
  });

  const isLoading = useMemo(
    () => isImporting || isUpdating || isFetchingData || isDeleting,
    [isImporting, isUpdating, isFetchingData, isDeleting]
  );

  return (
    <MyModal isOpen={true} isCentered w={'90vw'} maxW={'1440px'} h={'90vh'}>
      <MyBox isLoading={isLoading} display={'flex'} h={'100%'}>
        <Box p={5} bg={'myGray.50'} borderLeftRadius={'md'} borderRight={theme.borders.base}>
          <RawSourceBox
            w={'210px'}
            className="textEllipsis3"
            whiteSpace={'pre-wrap'}
            collectionId={collection._id}
            sourceName={collection.sourceName}
            sourceId={collection.sourceId}
            mb={6}
            fontSize={'sm'}
          />
          <SideTabs<TabEnum>
            list={tabList}
            value={currentTab}
            onChange={async (e) => {
              if (e === TabEnum.delete) {
                return openConfirm(onDeleteData)();
              }
              if (e === TabEnum.doc) {
                return window.open(getDocPath('/docs/course/dataset_engine'), '_blank');
              }
              setCurrentTab(e);
            }}
          />
        </Box>
        <Flex flexDirection={'column'} pb={8} flex={1} h={'100%'}>
          <Box fontSize={'md'} px={5} py={3} fontWeight={'medium'}>
            {currentTab === TabEnum.content && (
              <>{dataId ? t('dataset.data.Update Data') : t('dataset.data.Input Data')}</>
            )}
            {currentTab === TabEnum.index && <> {t('dataset.data.Index Edit')}</>}
          </Box>
          <Box flex={1} px={9} overflow={'auto'}>
            {currentTab === TabEnum.content && <InputTab maxToken={maxToken} register={register} />}
            {currentTab === TabEnum.index && (
              <Grid mt={3} gridTemplateColumns={['1fr', '1fr 1fr']} gridGap={4}>
                {indexes?.map((index, i) => (
                  <Box
                    key={index.dataId || i}
                    p={4}
                    borderRadius={'md'}
                    border={
                      index.defaultIndex
                        ? '1.5px solid var(--light-fastgpt-primary-opacity-01, rgba(51, 112, 255, 0.10))'
                        : '1.5px solid var(--Gray-Modern-200, #E8EBF0)'
                    }
                    bg={index.defaultIndex ? 'primary.50' : 'myGray.25'}
                    _hover={{
                      '& .delete': {
                        display: index.defaultIndex ? 'none' : 'block'
                      }
                    }}
                  >
                    <Flex mb={2}>
                      <Box
                        flex={1}
                        fontWeight={'medium'}
                        color={index.defaultIndex ? 'primary.700' : 'myGray.900'}
                      >
                        {index.defaultIndex
                          ? t('dataset.data.Default Index')
                          : t('dataset.data.Custom Index Number', { number: i })}
                      </Box>
                      <DeleteIcon
                        onClick={() => {
                          if (indexes.length <= 1) {
                            appendIndexes(getDefaultIndex({ dataId: `${Date.now()}` }));
                          }
                          removeIndexes(i);
                        }}
                      />
                    </Flex>
                    {index.defaultIndex ? (
                      <Box fontSize={'sm'} fontWeight={'medium'} color={'myGray.600'}>
                        {t('core.dataset.data.Default Index Tip')}
                      </Box>
                    ) : (
                      <Textarea
                        maxLength={maxToken}
                        rows={10}
                        borderColor={'transparent'}
                        px={0}
                        pt={0}
                        _focus={{
                          px: 3,
                          py: 2,
                          borderColor: 'primary.500',
                          boxShadow: '0px 0px 0px 2.4px rgba(51, 112, 255, 0.15)',
                          bg: 'white'
                        }}
                        placeholder={t('dataset.data.Index Placeholder')}
                        {...register(`indexes.${i}.text`, {
                          required: true
                        })}
                      />
                    )}
                  </Box>
                ))}
                <Flex
                  alignItems={'center'}
                  justifyContent={'center'}
                  borderRadius={'md'}
                  color={'myGray.600'}
                  fontWeight={'medium'}
                  border={'1.5px solid var(--Gray-Modern-200, #E8EBF0)'}
                  bg={'myGray.25'}
                  cursor={'pointer'}
                  _hover={{
                    bg: 'primary.50',
                    color: 'primary.600',
                    border:
                      '1.5px solid var(--light-fastgpt-primary-opacity-01, rgba(51, 112, 255, 0.10))'
                  }}
                  minH={'100px'}
                  onClick={() =>
                    appendIndexes({
                      defaultIndex: false,
                      text: '',
                      dataId: `${Date.now()}`
                    })
                  }
                >
                  <MyIcon name={'common/addLight'} w={'18px'} mr={1.5} />
                  <Box>{t('dataset.data.Add Index')}</Box>
                </Flex>
              </Grid>
            )}
          </Box>
          {/* footer */}
          <Flex justifyContent={'flex-end'} px={9} mt={6}>
            <Button variant={'whiteBase'} mr={3} onClick={onClose}>
              {t('common.Close')}
            </Button>
            <MyTooltip
              label={collection.permission.hasWritePer ? '' : t('dataset.data.Can not edit')}
            >
              <Button
                isDisabled={!collection.permission.hasWritePer}
                // @ts-ignore
                onClick={handleSubmit(dataId ? onUpdateData : sureImportData)}
              >
                {dataId ? t('common.Confirm Update') : t('common.Confirm Import')}
              </Button>
            </MyTooltip>
          </Flex>
        </Flex>
      </MyBox>
      <ConfirmModal />
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
    <HStack h={'100%'} spacing={6}>
      <Flex flexDirection={'column'} w={'50%'} h={'100%'}>
        <Flex pt={3} pb={2} fontWeight={'medium'} fontSize={'md'} alignItems={'center'}>
          <Box color={'red.600'}>*</Box>
          <Box color={'myGray.900'}>{t('core.dataset.data.Main Content')}</Box>
          <QuestionTip label={t('core.dataset.data.Data Content Tip')} ml={1} />
        </Flex>
        <Box flex={'1 0 0'}>
          <Textarea
            placeholder={t('core.dataset.data.Data Content Placeholder', { maxToken })}
            maxLength={maxToken}
            tabIndex={1}
            bg={'myGray.50'}
            h={'full'}
            {...register(`q`, {
              required: true
            })}
          />
        </Box>
      </Flex>
      <Flex flexDirection={'column'} w={'50%'} h={'100%'}>
        <Flex pt={3} pb={2} fontWeight={'medium'} fontSize={'md'} alignItems={'center'}>
          <Box color={'myGray.900'}>{t('core.dataset.data.Auxiliary Data')}</Box>
          <QuestionTip label={t('core.dataset.data.Auxiliary Data Tip')} ml={1} />
        </Flex>
        <Box flex={'1 0 0'}>
          <Textarea
            placeholder={t('core.dataset.data.Auxiliary Data Placeholder', {
              maxToken: maxToken * 1.5
            })}
            h={'100%'}
            tabIndex={1}
            bg={'myGray.50'}
            maxLength={maxToken * 1.5}
            {...register('a')}
          />
        </Box>
      </Flex>
    </HStack>
  );
};
