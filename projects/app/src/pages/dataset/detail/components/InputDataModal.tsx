import React, { useMemo, useState } from 'react';
import { Box, Flex, Button, Textarea, useTheme, Grid } from '@chakra-ui/react';
import { useFieldArray, useForm } from 'react-hook-form';
import {
  postInsertData2Dataset,
  putDatasetDataById,
  delOneDatasetDataById,
  getDatasetCollectionById,
  getDatasetDataItemById
} from '@/web/core/dataset/api';
import { useToast } from '@/web/common/hooks/useToast';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyModal from '@/components/MyModal';
import MyTooltip from '@/components/MyTooltip';
import { QuestionOutlineIcon } from '@chakra-ui/icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'next-i18next';
import { useRequest } from '@/web/common/hooks/useRequest';
import { countPromptTokens } from '@fastgpt/global/common/string/tiktoken';
import { useConfirm } from '@/web/common/hooks/useConfirm';
import { getDefaultIndex } from '@fastgpt/global/core/dataset/utils';
import { vectorModelList } from '@/web/common/system/staticData';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/constant';
import { DatasetDataIndexItemType } from '@fastgpt/global/core/dataset/type';
import SideTabs from '@/components/SideTabs';
import DeleteIcon from '@fastgpt/web/components/common/Icon/delete';
import { defaultCollectionDetail } from '@/constants/dataset';
import { getDocPath } from '@/web/common/system/doc';
import RawSourceBox from '@/components/core/dataset/RawSourceBox';
import MyBox from '@/components/common/MyBox';
import { getErrText } from '@fastgpt/global/common/error/utils';

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
    { label: t('dataset.data.edit.Content'), id: TabEnum.content, icon: 'common/overviewLight' },
    {
      label: t('dataset.data.edit.Index', { amount: indexes.length }),
      id: TabEnum.index,
      icon: 'kbTest'
    },
    ...(dataId
      ? [{ label: t('dataset.data.edit.Delete'), id: TabEnum.delete, icon: 'delete' }]
      : []),
    { label: t('dataset.data.edit.Course'), id: TabEnum.doc, icon: 'common/courseLight' }
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
            a: defaultValue.a,
            indexes: [getDefaultIndex({ dataId: `${Date.now()}` })]
          });
        }
      },
      onError(err) {
        toast({
          status: 'error',
          title: getErrText(err)
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
  }, [collection.datasetId.vectorModel]);

  // import new data
  const { mutate: sureImportData, isLoading: isImporting } = useRequest({
    mutationFn: async (e: InputDataType) => {
      if (!e.q) {
        setCurrentTab(TabEnum.content);
        return Promise.reject(t('dataset.data.input is empty'));
      }
      if (countPromptTokens(e.q) >= maxToken) {
        return toast({
          title: t('core.dataset.data.Too Long'),
          status: 'warning'
        });
      }

      const data = { ...e };

      const dataId = await postInsertData2Dataset({
        collectionId: collection._id,
        q: e.q,
        a: e.a,
        // remove dataId
        indexes: e.indexes.map((index) =>
          index.defaultIndex ? getDefaultIndex({ q: e.q, a: e.a }) : index
        )
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
        indexes: [getDefaultIndex({ q: e.q, a: e.a, dataId: `${Date.now()}` })]
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
        ...e
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
        <Box p={5} borderRight={theme.borders.base}>
          <RawSourceBox
            w={'200px'}
            className="textEllipsis3"
            whiteSpace={'pre-wrap'}
            sourceName={collection.sourceName}
            sourceId={collection.sourceId}
            mb={6}
            fontSize={'sm'}
          />
          <SideTabs
            list={tabList}
            activeId={currentTab}
            onChange={async (e: any) => {
              if (e === TabEnum.delete) {
                return openConfirm(onDeleteData)();
              }
              if (e === TabEnum.doc) {
                return window.open(getDocPath('/docs/use-cases/datasetengine'), '_blank');
              }
              setCurrentTab(e);
            }}
          />
        </Box>
        <Flex flexDirection={'column'} py={3} flex={1} h={'100%'}>
          <Box fontSize={'lg'} px={5} fontWeight={'bold'} mb={4}>
            {currentTab === TabEnum.content && (
              <>{dataId ? t('dataset.data.Update Data') : t('dataset.data.Input Data')}</>
            )}
            {currentTab === TabEnum.index && <> {t('dataset.data.Index Edit')}</>}
          </Box>
          <Box flex={1} px={5} overflow={'auto'}>
            {currentTab === TabEnum.content && (
              <>
                <Box>
                  <Flex alignItems={'center'}>
                    <Box>
                      <Box as="span" color={'red.600'}>
                        *
                      </Box>
                      {t('core.dataset.data.Data Content')}
                    </Box>
                    <MyTooltip label={t('core.dataset.data.Data Content Tip')}>
                      <QuestionOutlineIcon ml={1} />
                    </MyTooltip>
                  </Flex>
                  <Textarea
                    mt={1}
                    placeholder={t('core.dataset.data.Data Content Placeholder', { maxToken })}
                    maxLength={maxToken}
                    rows={12}
                    bg={'myWhite.400'}
                    {...register(`q`, {
                      required: true
                    })}
                  />
                </Box>
                <Box mt={5}>
                  <Flex>
                    <Box>{t('core.dataset.data.Auxiliary Data')}</Box>
                    <MyTooltip label={t('core.dataset.data.Auxiliary Data Tip')}>
                      <QuestionOutlineIcon ml={1} />
                    </MyTooltip>
                  </Flex>
                  <Textarea
                    mt={1}
                    placeholder={t('core.dataset.data.Auxiliary Data Placeholder', {
                      maxToken: maxToken * 1.5
                    })}
                    bg={'myWhite.400'}
                    rows={12}
                    maxLength={maxToken * 1.5}
                    {...register('a')}
                  />
                </Box>
              </>
            )}
            {currentTab === TabEnum.index && (
              <Grid gridTemplateColumns={['1fr', '1fr 1fr']} gridGap={4}>
                {indexes.map((index, i) => (
                  <Box
                    key={index.dataId || i}
                    p={3}
                    borderRadius={'md'}
                    border={theme.borders.base}
                    bg={i % 2 !== 0 ? 'myWhite.400' : ''}
                    _hover={{
                      '& .delete': {
                        display: index.defaultIndex && indexes.length === 1 ? 'none' : 'block'
                      }
                    }}
                  >
                    <Flex mb={1}>
                      <Box flex={1}>
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
                      <Box>{t('core.dataset.data.Default Index Tip')}</Box>
                    ) : (
                      <Textarea
                        maxLength={maxToken}
                        rows={10}
                        borderColor={'transparent'}
                        px={0}
                        _focus={{
                          borderColor: 'primary.400',
                          px: 3
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
                  flexDirection={'column'}
                  alignItems={'center'}
                  justifyContent={'center'}
                  borderRadius={'md'}
                  border={theme.borders.base}
                  cursor={'pointer'}
                  _hover={{
                    bg: 'primary.50'
                  }}
                  minH={'100px'}
                  onClick={() =>
                    appendIndexes({
                      defaultIndex: false,
                      type: DatasetDataIndexTypeEnum.chunk,
                      text: '',
                      dataId: `${Date.now()}`
                    })
                  }
                >
                  <MyIcon name={'common/addCircleLight'} w={'16px'} />
                  <Box>{t('dataset.data.Add Index')}</Box>
                </Flex>
              </Grid>
            )}
          </Box>
          <Flex justifyContent={'flex-end'} px={5} mt={4}>
            <Button variant={'whiteBase'} mr={3} onClick={onClose}>
              {t('common.Close')}
            </Button>
            <MyTooltip label={collection.canWrite ? '' : t('dataset.data.Can not edit')}>
              <Button
                isDisabled={!collection.canWrite}
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
