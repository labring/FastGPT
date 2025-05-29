import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Flex,
  Button,
  Textarea,
  ModalFooter,
  HStack,
  VStack,
  Image,
  Text,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalBody,
  Alert,
  AlertIcon
} from '@chakra-ui/react';
import type { UseFormRegister } from 'react-hook-form';
import { useFieldArray, useForm } from 'react-hook-form';
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
import { useTranslation } from 'next-i18next';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { getSourceNameIcon } from '@fastgpt/global/core/dataset/utils';
import type { DatasetDataIndexItemType } from '@fastgpt/global/core/dataset/type';
import DeleteIcon from '@fastgpt/web/components/common/Icon/delete';
import { defaultCollectionDetail } from '@/web/core/dataset/constants';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useUserStore } from '@/web/support/user/useUserStore';
import styles from './styles.module.scss';
import {
  DatasetDataIndexTypeEnum,
  getDatasetIndexMapData
} from '@fastgpt/global/core/dataset/data/constants';
import {
  DatasetCollectionDataProcessModeEnum,
  DatasetCollectionTypeEnum
} from '@fastgpt/global/core/dataset/constants';
import FillRowTabs from '@fastgpt/web/components/common/Tabs/FillRowTabs';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import { useSelectFile } from '@/web/common/file/hooks/useSelectFile';
import { generateImagePreviewUrl } from '@/web/core/dataset/image/utils';
import { uploadImage2Dataset } from '@/web/core/dataset/image/controller';

export type InputDataType = {
  q: string;
  a: string;
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
  defaultValue?: { q: string; a?: string };
  onClose: () => void;
  onSuccess: (data: InputDataType & { dataId: string }) => void;
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { embeddingModelList, defaultModels, getVlmModelList } = useSystemStore();
  const { userInfo } = useUserStore();

  const [currentTab, setCurrentTab] = useState(TabEnum.chunk);

  // Image related states
  const [imagePreview, setImagePreview] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [multipleImagesError, setMultipleImagesError] = useState(false);
  const [uploadedFileId, setUploadedFileId] = useState<string>('');
  const [isImageEnlarged, setIsImageEnlarged] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const [isImageHovered, setIsImageHovered] = useState(false);

  const { File: FileSelectDom, onOpen: onSelectFile } = useSelectFile({
    fileType: 'image/*',
    multiple: false
  });

  const { register, handleSubmit, reset, control } = useForm<InputDataType>();
  const {
    fields: indexes,
    prepend: prependIndexes,
    remove: removeIndexes,
    update: updateIndexes
  } = useFieldArray({
    control,
    name: 'indexes'
  });

  const { data: collection = defaultCollectionDetail } = useRequest2(
    () => {
      return getDatasetCollectionById(collectionId);
    },
    {
      manual: false,
      refreshDeps: [collectionId]
    }
  );

  // Check if it's an image dataset
  const isImageCollection = useMemo(() => {
    return collection?.type === DatasetCollectionTypeEnum.image;
  }, [collection]);

  // Set default tab based on dataset type
  useEffect(() => {
    if (isImageCollection) {
      setCurrentTab(TabEnum.image);
    } else {
      setCurrentTab(TabEnum.chunk);
    }
  }, [isImageCollection]);

  // Check if VLM model is available
  const hasVlmModel = useMemo(() => getVlmModelList().length > 0, [getVlmModelList]);

  // Image handling functions
  const handleSelectImage = useCallback(
    async (files: File[]) => {
      try {
        if (files.length > 1) {
          setMultipleImagesError(true);
          setTimeout(() => setMultipleImagesError(false), 3000);
          return;
        }

        if (files.length === 0) return;

        const file = files[0];
        setUploading(true);

        try {
          const result = await uploadImage2Dataset({
            file,
            datasetId: collection.dataset._id,
            collectionId: collectionId
          });

          try {
            const previewUrl = await generateImagePreviewUrl(
              result.id,
              collection.dataset._id,
              'preview'
            );

            setUploadedFileId(result.id);
            setImagePreview(previewUrl);
          } catch (error) {
            setUploadedFileId(result.id);
            toast({
              title: t('file:common.Loading image failed'),
              status: 'warning'
            });
          }
        } catch (error) {
          toast({
            title: getErrText(error, t('file:common.Loading image failed')),
            status: 'error'
          });
        } finally {
          setUploading(false);
        }
      } catch (error) {
        toast({
          title: t('file:common.Loading image failed'),
          status: 'error'
        });
        setUploading(false);
      }
    },
    [collection.dataset._id, collectionId, toast, userInfo?.team?.teamId]
  );

  const handleImageClick = useCallback(() => {
    setIsImageEnlarged(true);
  }, []);

  const handleCloseEnlargedImage = useCallback(() => {
    setIsImageEnlarged(false);
  }, []);

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
            q: res.q,
            a: res.a,
            indexes: res.indexes.map((item) => ({
              ...item,
              fold: true
            }))
          });

          // Handle image data - check if this specific data item has an image
          if (res.imageFileId && res.imageFileId.trim() !== '') {
            setUploadedFileId(res.imageFileId);
            setCurrentTab(TabEnum.image);
          } else if (res.a || defaultValue?.a) {
            // Only switch to QA tab if there's answer content and no image
            setCurrentTab(TabEnum.qa);
          } else {
            // Default to chunk tab for text-only data
            setCurrentTab(TabEnum.chunk);
          }
        } else if (defaultValue) {
          reset({
            q: defaultValue.q,
            a: defaultValue.a
          });

          // Set default tab based on content
          if (defaultValue.a) {
            setCurrentTab(TabEnum.qa);
          } else {
            setCurrentTab(TabEnum.chunk);
          }
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

  // Handle image preview URL generation separately
  useEffect(() => {
    if (uploadedFileId && userInfo?.team?.teamId && collection.dataset._id) {
      generateImagePreviewUrl(uploadedFileId, collection.dataset._id, 'preview')
        .then((url) => {
          setPreviewUrl(url);
        })
        .catch((error) => {
          toast({
            title: t('file:common.Loading image failed'),
            status: 'warning'
          });
        });
    }
  }, [uploadedFileId, userInfo?.team?.teamId, collection.dataset._id, toast]);

  const maxToken = useMemo(() => {
    const vectorModel =
      embeddingModelList.find((item) => item.model === collection.dataset.vectorModel) ||
      defaultModels.embedding;

    return vectorModel?.maxToken || 3000;
  }, [collection.dataset.vectorModel, defaultModels.embedding, embeddingModelList]);

  // Import new data
  const { runAsync: sureImportData, loading: isImporting } = useRequest2(
    async (e: InputDataType) => {
      if (!e.q) {
        return Promise.reject(t('common:dataset.data.input is empty'));
      }

      // Check if image is uploaded for image datasets
      if (currentTab === TabEnum.image && !uploadedFileId) {
        return Promise.reject(t('file:please upload image first'));
      }

      const totalLength = e.q.length + (e.a?.length || 0);
      if (totalLength >= maxToken * 1.4) {
        return Promise.reject(t('common:core.dataset.data.Too Long'));
      }

      const data = { ...e };

      const postData: any = {
        collectionId: collection._id,
        q: e.q,
        a: currentTab === TabEnum.qa ? e.a : '',
        // Contains no default index
        indexes: e.indexes.filter((item) => !!item.text?.trim())
      };

      // Add image ID for image datasets
      if (currentTab === TabEnum.image && uploadedFileId) {
        postData.imageFileId = uploadedFileId;
      }

      const dataId = await postInsertData2Dataset(postData);

      return {
        ...data,
        dataId
      };
    },
    {
      refreshDeps: [currentTab, uploadedFileId],
      successToast: t('common:dataset.data.Input Success Tip'),
      onSuccess(e) {
        reset({
          ...e,
          q: '',
          a: '',
          indexes: []
        });

        // Clear image states
        setImagePreview('');
        setUploadedFileId('');
        setPreviewUrl('');

        onSuccess(e);
      },
      errorToast: t('dataset:common.error.unKnow')
    }
  );

  // Update data
  const { runAsync: onUpdateData, loading: isUpdating } = useRequest2(
    async (e: InputDataType) => {
      if (!dataId) return Promise.reject(t('common:error.unKnow'));

      // Check if image is uploaded for image datasets
      if (currentTab === TabEnum.image && !uploadedFileId) {
        return Promise.reject(t('file:please upload image first'));
      }

      const updateData: any = {
        dataId,
        q: e.q,
        a: currentTab === TabEnum.qa ? e.a : '',
        indexes: e.indexes.filter((item) => !!item.text?.trim())
      };

      // Add image ID for image datasets
      if (currentTab === TabEnum.image && uploadedFileId) {
        updateData.imageFileId = uploadedFileId;
      }

      await putDatasetDataById(updateData);

      return {
        dataId,
        ...e
      };
    },
    {
      refreshDeps: [currentTab, uploadedFileId],
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
            {collection.sourceName || t('unknow_source')}
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
          {isImageCollection && !hasVlmModel && (
            <Alert status="warning" mb={4}>
              <AlertIcon />
              <Text fontSize="sm">{t('dataset:vlm_model_required_warning')}</Text>
            </Alert>
          )}

          {!isImageCollection && (
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
            <Flex flexDir={'column'} h={'100%'}>
              <FormLabel required mb={1} h={'30px'}>
                {currentTab === TabEnum.chunk
                  ? t('common:dataset_data_input_chunk_content')
                  : currentTab === TabEnum.qa
                    ? t('common:dataset_data_input_q')
                    : t('file:please input image description')}
              </FormLabel>
              {currentTab === TabEnum.image ? (
                <>
                  <Box
                    position="relative"
                    borderColor="myGray.200"
                    bg="myGray.25"
                    w="100%"
                    h="276px"
                    mb={3}
                    overflow="hidden"
                  >
                    {previewUrl || imagePreview ? (
                      <Box
                        flex="1"
                        overflow="hidden"
                        position="relative"
                        display="flex"
                        alignItems="center"
                        justifyContent="center"
                        onMouseEnter={() => setIsImageHovered(true)}
                        onMouseLeave={() => setIsImageHovered(false)}
                      >
                        <Image
                          src={previewUrl || imagePreview}
                          maxH="100%"
                          maxW="100%"
                          objectFit="contain"
                          alt={t('file:common.Image Preview')}
                          cursor="pointer"
                          onClick={handleImageClick}
                        />

                        {uploadedFileId && isImageHovered && (
                          <Box
                            position="absolute"
                            w="265px"
                            h="27.5px"
                            top="8px"
                            left="8px"
                            p="4px 8px"
                            border="1px solid"
                            borderColor="myGray.200"
                            bg="white"
                            overflow="hidden"
                          >
                            <Text fontSize="xs" color="gray.600" isTruncated maxW="200px">
                              ID: {uploadedFileId}
                            </Text>
                            <Flex gap="8px" alignItems="center">
                              <Box
                                cursor="pointer"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigator.clipboard.writeText(uploadedFileId);
                                  toast({
                                    title: t('file:common.Image ID copied'),
                                    status: 'success',
                                    duration: 2000,
                                    isClosable: true,
                                    position: 'top'
                                  });
                                }}
                              >
                                <MyIcon
                                  name="copy"
                                  w="14px"
                                  h="14px"
                                  color="gray.500"
                                  _hover={{ color: 'blue.500' }}
                                />
                              </Box>
                              <MyIcon name="common/link" w="12px" h="12px" color="blue.500" />
                            </Flex>
                          </Box>
                        )}

                        {isImageHovered && (
                          <Box
                            position="absolute"
                            w="22px"
                            h="25.20833px"
                            bottom="8px"
                            right="8px"
                            p="4px"
                            bg="white"
                            border="1px solid"
                            borderColor="myGray.250"
                            cursor="pointer"
                            _hover={{ bg: 'gray.50' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setPreviewUrl('');
                              setImagePreview('');
                              setUploadedFileId('');
                            }}
                          >
                            <MyIcon name="delete" w="14px" h="14px" color="myGray.600" />
                          </Box>
                        )}
                      </Box>
                    ) : (
                      <Box
                        display="flex"
                        flexDirection="column"
                        alignItems="center"
                        justifyContent="center"
                        h="100%"
                        w="100%"
                        borderWidth="1.5px"
                        borderStyle="dashed"
                        borderColor={uploading ? 'primary.600' : 'borderColor.high'}
                        bg={uploading ? 'primary.50' : 'white'}
                        cursor={uploading ? 'default' : 'pointer'}
                        _hover={
                          uploading
                            ? {}
                            : {
                                bg: 'primary.50',
                                borderColor: 'primary.600'
                              }
                        }
                        onClick={() => !uploading && onSelectFile()}
                      >
                        <MyIcon name="common/uploadFileFill" w="32px" />
                        <Box fontWeight="bold" mt={2}>
                          {uploading ? '上传中...' : '选择图片或拖拽到此处'}
                        </Box>
                        <Box color="myGray.500" fontSize="xs" mt={1}>
                          {t('file:common.dataset_data_input_image_support_format')}
                        </Box>
                      </Box>
                    )}
                  </Box>
                  <FormLabel required mb={1}>
                    {t('file:please input image description')}
                  </FormLabel>
                  <Textarea
                    resize={'none'}
                    placeholder={t('file:Please enter the description of the picture')}
                    className={styles.scrollbar}
                    maxLength={8000}
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
                    {...register('q', {
                      required: true
                    })}
                  />
                </>
              ) : (
                <Textarea
                  resize={'none'}
                  placeholder={t('common:dataset_data_import_q_placeholder', { maxToken })}
                  className={styles.scrollbar}
                  maxLength={maxToken}
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
              )}
            </Flex>
            {currentTab === TabEnum.qa && (
              <Flex flexDir={'column'} h={'100%'}>
                <FormLabel required mb={1}>
                  {t('common:dataset_data_input_a')}
                </FormLabel>
                <Textarea
                  resize={'none'}
                  placeholder={t('common:dataset_data_import_q_placeholder', { maxToken })}
                  className={styles.scrollbar}
                  flex={'1 0 0'}
                  tabIndex={1}
                  bg={'myGray.25'}
                  maxLength={maxToken}
                  borderRadius={'md'}
                  border={'1.5px solid '}
                  borderColor={'myGray.200'}
                  {...register('a', { required: true })}
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

      {isImageCollection && (
        <FileSelectDom
          onSelect={(files) => {
            handleSelectImage(files);
          }}
        />
      )}

      {multipleImagesError && (
        <Flex
          position="fixed"
          top="10px"
          left="50%"
          transform="translateX(-50%)"
          width="390px"
          height="48px"
          borderRadius="sm"
          justifyContent="space-between"
          alignItems="center"
          px={6}
          py={3}
          bg="var(--Red-50, #FEF3F2)"
          boxShadow="0px 0px 1px 0px #13336B1A, 0px 4px 10px 0px #13336B1A"
          zIndex={1000}
        >
          <Flex alignItems="center" gap={2}>
            <Box
              width="24px"
              height="24px"
              borderRadius="full"
              bg="var(--Red-600, #D92D20)"
              display="flex"
              alignItems="center"
              justifyContent="center"
              boxSizing="border-box"
              border="1px solid rgba(255,255,255,0.2)"
            >
              <MyIcon
                name="soliderror"
                width="14px"
                height="14px"
                color="white"
                style={{ margin: 'auto' }}
              />
            </Box>
            <Text fontSize="sm" fontWeight="medium" color="red.800">
              {t('file:common.Only support uploading one image')}
            </Text>
          </Flex>

          <MyIcon
            name="close"
            width="16px"
            height="16px"
            cursor="pointer"
            color="gray.500"
            onClick={() => setMultipleImagesError(false)}
          />
        </Flex>
      )}

      {isImageEnlarged && (
        <Modal isOpen={isImageEnlarged} onClose={handleCloseEnlargedImage} size="6xl" isCentered>
          <ModalOverlay bg="blackAlpha.600" backdropFilter="blur(10px)" />
          <ModalContent maxWidth="95vw" maxHeight="95vh" bg="transparent" boxShadow="none">
            <ModalBody display="flex" alignItems="center" justifyContent="center" p={0}>
              <Box
                width="1440px"
                padding="24px 40px 24px 0px"
                flexDirection="column"
                alignItems="flex-start"
                gap="10px"
                flex-shrink="0"
                bg="blackAlpha.200"
                borderRadius="lg"
                position="relative"
                overflow="hidden"
              >
                <Box
                  width="100%"
                  height="100%"
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                  bg="var(--Gray-Modern-100, #FFFFFF)"
                  borderRadius="lg"
                  overflow="hidden"
                >
                  <Image
                    src={previewUrl || imagePreview}
                    width="100%"
                    height="100%"
                    objectFit="contain"
                    alt="放大的图片"
                  />
                </Box>

                <Box
                  position="absolute"
                  top="0px"
                  right="0px"
                  width="40px"
                  height="40px"
                  borderRadius="7.14px"
                  bg="blackAlpha.200"
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                  cursor="pointer"
                  padding="8px"
                  _hover={{ bg: 'blackAlpha.800' }}
                  onClick={handleCloseEnlargedImage}
                  zIndex={5}
                >
                  <MyIcon name="close" width="24px" height="24px" color="white" />
                </Box>
              </Box>
            </ModalBody>
          </ModalContent>
        </Modal>
      )}
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
