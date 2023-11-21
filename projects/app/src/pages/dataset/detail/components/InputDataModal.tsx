import React, { useMemo, useState } from 'react';
import { Box, Flex, Button, Textarea, BoxProps, Image, useTheme, Grid } from '@chakra-ui/react';
import { useFieldArray, useForm } from 'react-hook-form';
import {
  postInsertData2Dataset,
  putDatasetDataById,
  delOneDatasetDataById,
  getDatasetCollectionById
} from '@/web/core/dataset/api';
import { useToast } from '@/web/common/hooks/useToast';
import { getErrText } from '@fastgpt/global/common/error/utils';
import MyIcon from '@/components/Icon';
import MyModal from '@/components/MyModal';
import MyTooltip from '@/components/MyTooltip';
import { QuestionOutlineIcon } from '@chakra-ui/icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'next-i18next';
import { getFileAndOpen } from '@/web/core/dataset/utils';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useRequest } from '@/web/common/hooks/useRequest';
import { countPromptTokens } from '@fastgpt/global/common/string/tiktoken';
import { useConfirm } from '@/web/common/hooks/useConfirm';
import { getDefaultIndex, getSourceNameIcon } from '@fastgpt/global/core/dataset/utils';
import { feConfigs, vectorModelList } from '@/web/common/system/staticData';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/constant';
import { DatasetDataIndexItemType } from '@fastgpt/global/core/dataset/type';
import SideTabs from '@/components/SideTabs';
import { useLoading } from '@/web/common/hooks/useLoading';
import DeleteIcon from '@/components/Icon/delete';
import { defaultCollectionDetail } from '@/constants/dataset';

export type RawSourceTextProps = BoxProps & {
  sourceName?: string;
  sourceId?: string;
  canView?: boolean;
};
export type InputDataType = {
  id?: string;
  q: string;
  a?: string;
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
  defaultValue,
  onClose,
  onSuccess,
  onDelete
}: {
  collectionId: string;
  defaultValue: InputDataType;
  onClose: () => void;
  onSuccess: (data: InputDataType) => void;
  onDelete?: () => void;
}) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const { toast } = useToast();
  const { Loading } = useLoading();
  const [currentTab, setCurrentTab] = useState(TabEnum.content);

  const { register, handleSubmit, reset, control } = useForm<InputDataType>({
    defaultValues: defaultValue
  });
  const {
    fields: indexes,
    append: appendIndexes,
    remove: removeIndexes
  } = useFieldArray({
    control,
    name: 'indexes'
  });

  const tabList = [
    { label: t('dataset.data.edit.Content'), id: TabEnum.content, icon: 'overviewLight' },
    {
      label: t('dataset.data.edit.Index', { amount: indexes.length }),
      id: TabEnum.index,
      icon: 'kbTest'
    },
    ...(defaultValue.id
      ? [{ label: t('dataset.data.edit.Delete'), id: TabEnum.delete, icon: 'delete' }]
      : []),
    { label: t('dataset.data.edit.Course'), id: TabEnum.doc, icon: 'common/courseLight' }
  ];

  const { ConfirmModal, openConfirm } = useConfirm({
    content: t('dataset.data.Delete Tip')
  });

  const { data: collection = defaultCollectionDetail } = useQuery(
    ['loadCollectionId', collectionId],
    () => {
      return getDatasetCollectionById(collectionId);
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
          title: '总长度超长了',
          status: 'warning'
        });
      }

      const data = { ...e };

      data.id = await postInsertData2Dataset({
        collectionId: collection._id,
        q: e.q,
        a: e.a,
        // remove dataId
        indexes: e.indexes.map((index) =>
          index.defaultIndex ? getDefaultIndex({ q: e.q, a: e.a }) : index
        )
      });

      return data;
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
      if (!e.id) return e;

      // not exactly same
      await putDatasetDataById({
        id: e.id,
        q: e.q,
        a: e.a,
        indexes: e.indexes
      });

      return e;
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
      if (!onDelete || !defaultValue.id) return Promise.resolve(null);
      return delOneDatasetDataById(defaultValue.id);
    },
    onSuccess() {
      if (!onDelete) return;
      onDelete();
      onClose();
    },
    successToast: t('common.Delete Success'),
    errorToast: t('common.error.unKnow')
  });

  const loading = useMemo(() => isImporting || isUpdating, [isImporting, isUpdating]);

  return (
    <MyModal isOpen={true} isCentered w={'90vw'} maxW={'1440px'} h={'90vh'}>
      <Flex h={'100%'}>
        <Box p={5} borderRight={theme.borders.base}>
          <RawSourceText
            w={'200px'}
            className=""
            whiteSpace={'pre-wrap'}
            sourceName={collection.sourceName}
            sourceId={collection.sourceId}
            mb={6}
            fontSize={['14px', '16px']}
          />
          <SideTabs
            list={tabList}
            activeId={currentTab}
            onChange={async (e: any) => {
              if (e === TabEnum.delete) {
                return openConfirm(onDeleteData)();
              }
              if (e === TabEnum.doc) {
                return window.open(`${feConfigs.docUrl}/docs/use-cases/datasetengine`, '_blank');
              }
              setCurrentTab(e);
            }}
          />
        </Box>
        <Flex flexDirection={'column'} px={5} py={3} flex={1} h={'100%'}>
          <Box fontSize={'lg'} fontWeight={'bold'} mb={4}>
            {currentTab === TabEnum.content && (
              <>{defaultValue.id ? t('dataset.data.Update Data') : t('dataset.data.Input Data')}</>
            )}
            {currentTab === TabEnum.index && <> {t('dataset.data.Index Edit')}</>}
          </Box>
          <Box flex={1} overflow={'auto'}>
            {currentTab === TabEnum.content && (
              <>
                <Box>
                  <Flex alignItems={'center'}>
                    <Box>
                      <Box as="span" color={'red.600'}>
                        *
                      </Box>
                      {'相关数据内容'}
                    </Box>
                    <MyTooltip
                      label={'该输入框是必填项\n该内容通常是对于知识点的描述，也可以是用户的问题。'}
                    >
                      <QuestionOutlineIcon ml={1} />
                    </MyTooltip>
                  </Flex>
                  <Textarea
                    mt={1}
                    placeholder={`该输入框是必填项，该内容通常是对于知识点的描述，也可以是用户的问题，最多 ${maxToken} 字。`}
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
                    <Box>{'辅助数据'}</Box>
                    <MyTooltip
                      label={
                        '该部分为可选填项\n该内容通常是为了与前面的数据内容配合，构建结构化提示词，用于特殊场景'
                      }
                    >
                      <QuestionOutlineIcon ml={1} />
                    </MyTooltip>
                  </Flex>
                  <Textarea
                    mt={1}
                    placeholder={`该部分为可选填项, 通常是为了与前面的【数据内容】配合，构建结构化提示词，用于特殊场景，最多 ${
                      maxToken * 1.5
                    } 字。`}
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
                      <Box>
                        无法编辑，默认索引会使用【相关数据内容】与【辅助数据】的文本直接生成索引，如不需要默认索引，可删除。
                        每条数据必须保证有一个以上索引，所有索引被删除后，会自动生成默认索引。
                      </Box>
                    ) : (
                      <Textarea
                        maxLength={maxToken}
                        rows={10}
                        borderColor={'transparent'}
                        px={0}
                        _focus={{
                          borderColor: 'myBlue.400',
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
                    bg: 'myBlue.100'
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
          <Flex justifyContent={'flex-end'} mt={4}>
            <Button variant={'base'} mr={3} isLoading={loading} onClick={onClose}>
              {t('common.Close')}
            </Button>
            <MyTooltip label={collection.canWrite ? '' : t('dataset.data.Can not edit')}>
              <Button
                isDisabled={!collection.canWrite}
                isLoading={loading}
                // @ts-ignore
                onClick={handleSubmit(defaultValue.id ? onUpdateData : sureImportData)}
              >
                {defaultValue.id ? '确认变更' : '确认导入'}
              </Button>
            </MyTooltip>
          </Flex>
        </Flex>
      </Flex>
      <ConfirmModal />
      <Loading fixed={false} loading={isDeleting} />
    </MyModal>
  );
};

export default InputDataModal;

export function RawSourceText({
  sourceId,
  sourceName = '',
  canView = true,
  ...props
}: RawSourceTextProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { setLoading } = useSystemStore();

  const canPreview = useMemo(() => !!sourceId && canView, [canView, sourceId]);

  const icon = useMemo(() => getSourceNameIcon({ sourceId, sourceName }), [sourceId, sourceName]);

  return (
    <MyTooltip
      label={canPreview ? t('file.Click to view file') || '' : ''}
      shouldWrapChildren={false}
    >
      <Box
        color={'myGray.600'}
        display={'inline-flex'}
        whiteSpace={'nowrap'}
        {...(canPreview
          ? {
              cursor: 'pointer',
              textDecoration: 'underline',
              onClick: async () => {
                setLoading(true);
                try {
                  await getFileAndOpen(sourceId as string);
                } catch (error) {
                  toast({
                    title: getErrText(error, '获取文件地址失败'),
                    status: 'error'
                  });
                }
                setLoading(false);
              }
            }
          : {})}
        {...props}
      >
        <Image src={icon} alt="" w={['14px', '16px']} mr={2} />
        <Box maxW={['200px', '300px']} className={props.className ?? 'textEllipsis'}>
          {sourceName || t('common.UnKnow Source')}
        </Box>
      </Box>
    </MyTooltip>
  );
}
