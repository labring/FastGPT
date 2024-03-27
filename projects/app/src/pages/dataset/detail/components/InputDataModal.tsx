import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Flex,
  Button,
  Textarea,
  useTheme,
  Grid,
  Image,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  useDisclosure,
  MenuItemProps
} from '@chakra-ui/react';
import {
  UseFormRegister,
  UseFormSetValue,
  UseFormWatch,
  useFieldArray,
  useForm
} from 'react-hook-form';
import {
  postInsertData2Dataset,
  putDatasetDataById,
  delOneDatasetDataById,
  getDatasetCollectionById,
  getDatasetDataItemById,
  createImageDescription
} from '@/web/core/dataset/api';
import { useToast } from '@fastgpt/web/hooks/useToast';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyModal from '@/components/MyModal';
import MyTooltip from '@/components/MyTooltip';
import { CheckCircleIcon, ChevronDownIcon, QuestionOutlineIcon } from '@chakra-ui/icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'next-i18next';
import { useRequest } from '@/web/common/hooks/useRequest';
import { countPromptTokens } from '@fastgpt/global/common/string/tiktoken';
import { useConfirm } from '@/web/common/hooks/useConfirm';
import { getDefaultIndex } from '@fastgpt/global/core/dataset/utils';
import { DatasetDataIndexItemType } from '@fastgpt/global/core/dataset/type';
import SideTabs from '@/components/SideTabs';
import DeleteIcon from '@fastgpt/web/components/common/Icon/delete';
import { defaultCollectionDetail } from '@/constants/dataset';
import { getDocPath } from '@/web/common/system/doc';
import RawSourceBox from '@/components/core/dataset/RawSourceBox';
import MyBox from '@/components/common/MyBox';
import { getErrText } from '@fastgpt/global/common/error/utils';
import RowTabs from '@fastgpt/web/components/common/Tabs/RowTabs';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import ImageUpload from './upload';
import { useSelectFile } from '@/web/common/file/hooks/useSelectFile';
import { uploadImage } from '@/web/common/file/controller';

export type InputDataType = {
  q: string;
  a: string;
  image: string;
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
  defaultValue?: { q: string; a?: string; image: string };
  onClose: () => void;
  onSuccess: (data: InputDataType & { dataId: string }) => void;
  onDelete?: () => void;
}) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const { toast } = useToast();
  const [currentTab, setCurrentTab] = useState(TabEnum.content);
  const { vectorModelList } = useSystemStore();

  const { register, handleSubmit, reset, control, setValue, watch } = useForm<InputDataType>();
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
            image: res.image,
            indexes: res.indexes
          });
        } else if (defaultValue) {
          reset({
            q: defaultValue.q,
            a: defaultValue.a,
            image: defaultValue.image
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
      if (countPromptTokens(e.q) >= maxToken) {
        return Promise.reject(t('core.dataset.data.Too Long'));
      }

      const data = { ...e };

      const dataId = await postInsertData2Dataset({
        collectionId: collection._id,
        q: e.q,
        a: e.a,
        image: e.image,
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
            index.defaultIndex
              ? getDefaultIndex({ q: e.q, a: e.a, image: e.image, dataId: index.dataId })
              : index
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
              <InputTab
                maxToken={maxToken}
                register={register}
                setValue={setValue}
                getValue={watch}
              />
            )}
            {currentTab === TabEnum.index && (
              <Grid gridTemplateColumns={['1fr', '1fr 1fr']} gridGap={4}>
                {indexes?.map((index, i) => (
                  <Box
                    key={index.dataId || i}
                    p={3}
                    borderRadius={'md'}
                    border={theme.borders.base}
                    bg={i % 2 !== 0 ? 'myWhite.400' : ''}
                    _hover={{
                      '& .delete': {
                        display: index.defaultIndex ? 'none' : 'block'
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
          {/* footer */}
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

enum InputTypeEnum {
  q = 'q',
  a = 'a'
}
const InputTab = ({
  maxToken,
  register,
  setValue,
  getValue
}: {
  maxToken: number;
  register: UseFormRegister<InputDataType>;
  setValue: UseFormSetValue<InputDataType>;
  getValue: UseFormWatch<InputDataType>;
}) => {
  const { t } = useTranslation();
  const { isPc } = useSystemStore();
  const [imageUrl, setImageUrl] = useState('');
  const [imageItem, setImageItem] = useState('');
  const [inputType, setInputType] = useState(InputTypeEnum.q);
  const ref = useRef<HTMLButtonElement>(null);
  const menuItemStyles: MenuItemProps = {
    borderRadius: 'sm',
    py: 2,
    display: 'flex',
    alignItems: 'center',
    _hover: {
      backgroundColor: 'myWhite.600'
    },
    _notLast: {
      mb: 2
    }
  };
  const url = getValue('image');
  useEffect(() => {
    setImageUrl(url);
  }, [url]);

  const imageMaps = [
    {
      type: '1',
      label: '关系图'
    },
    {
      type: '2',
      label: '流程图'
    },
    {
      type: '3',
      label: 'DAG 图'
    },
    {
      type: '4',
      label: 'ER 图'
    }
  ];
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { File, onOpen: onOpenSelectFile } = useSelectFile({
    fileType: '.jpg,.png',
    multiple: false
  });

  const { mutate: onSelectFile, isLoading: isSelecting } = useRequest({
    mutationFn: (e: File[]) => {
      const file = e[0];
      if (!file) return Promise.resolve(null);
      return uploadImage(file);
    },
    onSuccess(data: { file: { url: string } }) {
      if (data) {
        setImageUrl(data.file.url);
        setValue('image', data.file.url);
      }
    },
    errorToast: t('common.avatar.Select Failed')
  });
  const { mutate: createDescription, isLoading: isRequest } = useRequest({
    mutationFn: ({ image, type }) => {
      return createImageDescription(image, type);
    },
    onSuccess(data: { description: string }) {
      if (data) {
        setValue('q', data.description);
      }
    },
    errorToast: t('common.avatar.Select Failed')
  });

  return (
    <Flex flexDirection={'column'} h={'100%'}>
      <Box>
        <RowTabs
          list={[
            {
              label: (
                <Flex alignItems={'center'}>
                  <Box as="span" color={'red.600'}>
                    *
                  </Box>
                  {t('core.dataset.data.Main Content')}
                  <MyTooltip label={t('core.dataset.data.Data Content Tip')}>
                    <QuestionOutlineIcon ml={1} />
                  </MyTooltip>
                </Flex>
              ),
              value: InputTypeEnum.q
            },
            {
              label: (
                <Flex alignItems={'center'}>
                  {t('core.dataset.data.Auxiliary Data')}
                  <MyTooltip label={t('core.dataset.data.Auxiliary Data Tip')}>
                    <QuestionOutlineIcon ml={1} />
                  </MyTooltip>
                </Flex>
              ),
              value: InputTypeEnum.a
            }
          ]}
          value={inputType}
          onChange={(e) => setInputType(e as InputTypeEnum)}
        />
      </Box>

      <Box mt={3} flex={'1 0 0'}>
        {inputType === InputTypeEnum.q && (
          <Box>
            <Image src={imageUrl}></Image>
            <Textarea
              placeholder={t('core.dataset.data.Data Content Placeholder', { maxToken })}
              maxLength={maxToken}
              h={'100%'}
              bg={'myWhite.400'}
              {...register(`q`, {
                required: true
              })}
            />
            {/* <ImageUpload onSuccess={(data: { file: { url: React.SetStateAction<string>; }; }) => {
              setImageUrl(data.file.url)
            }} /> */}
            <Button mt={4} colorScheme="whitePrimary" onClick={onOpenSelectFile}>
              上传图片
            </Button>
            <Menu
              autoSelect={false}
              isOpen={isOpen}
              onOpen={onOpen}
              onClose={onClose}
              strategy={'fixed'}
              matchWidth
            >
              <MenuButton
                as={Button}
                ref={ref}
                px={3}
                mt={4}
                ml={4}
                rightIcon={<ChevronDownIcon />}
                variant={'whitePrimary'}
                textAlign={'left'}
                _active={{
                  transform: 'none'
                }}
                {...(isOpen
                  ? {
                      boxShadow: '0px 0px 4px #A8DBFF',
                      borderColor: 'primary.500'
                    }
                  : {})}
              >
                {imageItem.label || '图片类型'}
              </MenuButton>

              <MenuList
                w={'auto'}
                p={'6px'}
                border={'1px solid #fff'}
                boxShadow={
                  '0px 2px 4px rgba(161, 167, 179, 0.25), 0px 0px 1px rgba(121, 141, 159, 0.25);'
                }
                zIndex={99}
                maxH={'40vh'}
                overflowY={'auto'}
              >
                {imageMaps.map((item) => (
                  <MenuItem
                    key={item.type}
                    {...menuItemStyles}
                    onClick={() => {
                      setImageItem(item);
                    }}
                    whiteSpace={'pre-wrap'}
                  >
                    {item.label}
                  </MenuItem>
                ))}
              </MenuList>
            </Menu>
            <Button
              mt={4}
              ml={4}
              colorScheme="whitePrimary"
              onClick={() => {
                createDescription(imageUrl, imageItem.type);
              }}
            >
              生成描述
            </Button>
          </Box>
        )}
        {inputType === InputTypeEnum.a && (
          <Textarea
            placeholder={t('core.dataset.data.Auxiliary Data Placeholder', {
              maxToken: maxToken * 1.5
            })}
            h={'100%'}
            bg={'myWhite.400'}
            rows={isPc ? 24 : 12}
            maxLength={maxToken * 1.5}
            {...register('a')}
          />
        )}
      </Box>
      <File onSelect={onSelectFile} />
    </Flex>
  );
};
