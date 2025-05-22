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
  Input,
  Text,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalBody,
  ModalCloseButton
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
import styles from './styles.module.scss';
import {
  DatasetDataIndexTypeEnum,
  getDatasetIndexMapData
} from '@fastgpt/global/core/dataset/data/constants';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import { useSelectFile } from '@/web/common/file/hooks/useSelectFile';
import FileSelector from './Import/components/FileSelector';
import type { ImportSourceItemType } from '@/web/core/dataset/type.d';
import { BucketNameEnum, ReadFileBaseUrl } from '@fastgpt/global/common/file/constants';
import { uploadFile2DB } from '@/web/common/file/controller';
import { POST } from '@/web/common/api/request';

export type InputDataType = {
  q: string;
  a: string; // 保留a字段，但不再使用
  indexes: (Omit<DatasetDataIndexItemType, 'dataId'> & {
    dataId?: string; // pg data id
    fold: boolean;
  })[];
};

// 复用DataCard.tsx中的获取token方法
const postGetFileToken = (params: {
  bucketName: string;
  fileId: string;
  teamId: string;
  datasetId: string;
}) => POST<string>('common/file/token', params);

const ImageDatasetInputModal = ({
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
  const { embeddingModelList, defaultModels } = useSystemStore();

  // 添加图片上传状态
  const [imagePreview, setImagePreview] = useState<string>('');
  const [selectFiles, setSelectFiles] = useState<ImportSourceItemType[]>([]);
  const [uploading, setUploading] = useState(false);
  const [multipleImagesError, setMultipleImagesError] = useState(false);
  // 添加文件ID状态，用于存储上传到数据库的图片ID
  const [uploadedFileId, setUploadedFileId] = useState<string>('');
  // 添加图片放大状态
  const [isImageEnlarged, setIsImageEnlarged] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const [isEditing, setIsEditing] = useState(!!dataId);
  const [loading, setLoading] = useState(false);
  const [isImageHovered, setIsImageHovered] = useState(false);

  // 引入文件选择器
  const {
    File: FileSelectDom,
    onOpen: onSelectFile,
    onSelectImage
  } = useSelectFile({
    fileType: 'image/*',
    multiple: false
  });

  const { register, handleSubmit, reset, control, setValue } = useForm<InputDataType>();
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

  // 删除第一个getDatasetDataItemById调用
  const { loading: isFetchingData } = useRequest2(
    () => Promise.resolve(null), // 空请求，让状态管理保持一致
    {
      manual: true
    }
  );

  const maxToken = useMemo(() => {
    const vectorModel =
      embeddingModelList.find((item) => item.model === collection.dataset.vectorModel) ||
      defaultModels.embedding;

    return vectorModel?.maxToken || 3000;
  }, [collection.dataset.vectorModel, defaultModels.embedding, embeddingModelList]);

  // 整合获取详情数据和处理图片预览的逻辑
  useEffect(() => {
    let isActive = true; // 用于处理组件卸载后的状态更新问题
    setLoading(true);

    const fetchData = async () => {
      try {
        if (dataId) {
          // 获取现有数据
          const data = await getDatasetDataItemById(dataId);

          if (!isActive) return;

          reset({
            q: data.q,
            a: '', // 不再使用a字段
            indexes:
              data.indexes?.map((item) => ({
                ...item,
                fold: true
              })) || []
          });

          // 如果有图片ID，生成预览URL
          if (data.imageFileId) {
            // 获取预览URL
            const origin = window.location.origin;
            const token = await postGetFileToken({
              bucketName: 'dataset',
              fileId: data.imageFileId,
              teamId: data.teamId,
              datasetId: data.datasetId
            });

            if (!isActive) return;

            const url = `${origin}${ReadFileBaseUrl}/${encodeURIComponent('')}?token=${token}`;
            setPreviewUrl(url);
            setUploadedFileId(data.imageFileId);
          }
        } else if (defaultValue) {
          // 处理默认值
          reset({
            q: defaultValue.q,
            a: ''
          });
        }
      } catch (error) {
        console.error('获取数据失败', error);
        if (isActive) {
          toast({
            status: 'error',
            title: t(getErrText(error) as any)
          });
          onClose();
        }
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      isActive = false; // 组件卸载时设置为false
    };
  }, [dataId, reset, setValue, defaultValue, toast, onClose, t]);

  // 改进处理图片选择的函数
  const handleSelectImage = useCallback(
    (files: File[] | ImportSourceItemType[]) => {
      try {
        // 检查是否选择了多个文件
        if (files.length > 1) {
          // 立即清空已选文件
          setSelectFiles([]);
          setMultipleImagesError(true);
          setTimeout(() => setMultipleImagesError(false), 3000);
          return;
        }

        // 单个文件的处理逻辑
        let file: File | undefined;

        if (files.length > 0) {
          if ('file' in files[0]) {
            file = (files[0] as ImportSourceItemType).file;
          } else {
            file = files[0] as File;
          }

          if (file) {
            // 继续上传逻辑...
            uploadFile2DB({
              file,
              bucketName: BucketNameEnum.dataset,
              data: {
                datasetId: collection.dataset._id
              },
              percentListen: (percent) => {
                setSelectFiles((state) =>
                  state.map((item, index) =>
                    index === 0 ? { ...item, uploadedFileRate: percent } : item
                  )
                );
              }
            })
              .then(({ fileId, previewUrl }) => {
                setUploadedFileId(fileId);
                setImagePreview(previewUrl);
              })
              .catch((error) => {
                console.error('图片上传失败:', error);
                toast({
                  title: getErrText(error, '图片上传失败'),
                  status: 'error'
                });
              });
          }
        }
      } catch (error) {
        console.error('处理图片预览错误:', error);
        toast({
          title: '图片预览失败',
          status: 'error'
        });
      }
    },
    [collection.dataset._id, toast, setValue]
  );

  // 处理图片点击放大
  const handleImageClick = useCallback(() => {
    setIsImageEnlarged(true);
  }, []);

  // 处理关闭放大的图片
  const handleCloseEnlargedImage = useCallback(() => {
    setIsImageEnlarged(false);
  }, []);

  // 在组件卸载时清理图片预览URL，防止内存泄漏
  useEffect(() => {
    return () => {
      // 组件卸载时，确保清理所有状态
      setSelectFiles([]);
      setUploadedFileId('');
      setImagePreview('');
    };
  }, []);

  // update
  const { runAsync: onUpdateData, loading: isUpdating } = useRequest2(
    async (e: InputDataType) => {
      if (!dataId) return Promise.reject(t('error.unKnow'));

      if (!e.q) {
        return Promise.reject('请输入图片描述');
      }

      // 清理索引中的临时ID
      const cleanedIndexes = e.indexes
        .filter((item) => !!item.text?.trim())
        .map((item) => {
          // 如果dataId是以temp_id_开头，则移除该属性
          if (
            item.dataId &&
            typeof item.dataId === 'string' &&
            item.dataId.startsWith('temp_id_')
          ) {
            const { dataId, ...rest } = item;
            return rest;
          }
          return item;
        });

      console.log('清理后的索引:', cleanedIndexes);

      await putDatasetDataById({
        dataId,
        q: e.q,
        a: '', // 不再在a字段中存储文件名
        indexes: cleanedIndexes,
        ...((uploadedFileId ? { imageFileId: uploadedFileId } : {}) as any)
      });

      return {
        dataId,
        ...e,
        imageFileId: uploadedFileId
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

  // 更新表单提交逻辑
  const { runAsync: sureImportData, loading: isImporting } = useRequest2(
    async (e: InputDataType) => {
      if (!e.q) {
        return Promise.reject('请输入图片描述');
      }

      if (!uploadedFileId) {
        return Promise.reject('请上传图片');
      }

      const data = { ...e };

      try {
        // 清理索引中的临时ID
        const cleanedIndexes = e.indexes
          .filter((item) => !!item.text?.trim())
          .map((item) => {
            // 如果dataId是以temp_id_开头，则移除该属性
            if (
              item.dataId &&
              typeof item.dataId === 'string' &&
              item.dataId.startsWith('temp_id_')
            ) {
              const { dataId, ...rest } = item;
              return rest;
            }
            return item;
          });

        console.log('清理后的索引:', cleanedIndexes);

        // 这里是数据提交阶段，把上传的图片ID和表单内容一起发送到服务端
        const postData: any = {
          collectionId: collection._id,
          q: data.q, // q字段作为图片描述
          a: '', // 不再在a字段中存储文件名
          indexes: cleanedIndexes,
          imageFileId: uploadedFileId // 使用imageFileId存储图片ID
        };

        console.log('[图片数据集] 提交前数据:', JSON.stringify(postData));

        // 实际提交
        const newDataId = await postInsertData2Dataset(postData);
        console.log('[图片数据集] 提交成功，返回ID:', newDataId);

        return {
          ...data,
          dataId: newDataId,
          imageFileId: uploadedFileId
        };
      } catch (error) {
        console.error('[图片数据集] 处理过程错误:', error);
        return Promise.reject(error);
      }
    },
    {
      successToast: t('common:dataset.data.Input Success Tip'),
      onSuccess(e) {
        console.log('[图片数据集] 成功回调:', e);

        // 重置所有表单数据和状态
        reset({
          q: '',
          a: '',
          indexes: []
        });

        // 清空图片预览和文件ID
        setImagePreview('');
        setUploadedFileId('');
        setSelectFiles([]);

        // 告知父组件刷新列表，但不关闭模态框
        if (!dataId) {
          // 只在新增模式下回调外部刷新函数
          onSuccess(e as any); // 使用类型断言解决类型问题
        } else {
          // 在编辑模式下正常关闭
          onSuccess(e);
        }
      },
      onError(err) {
        console.error('[图片数据集] 错误回调:', err);
        toast({
          title: getErrText(
            err,
            '上传失败: ' + (typeof err === 'string' ? err : JSON.stringify(err))
          ),
          status: 'error'
        });
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
            {collection.sourceName || t('common:unknow_source')} - 图片集合
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
        {/* 移除Tab切换，但保留相同的空间和布局 */}
        <Box px={[5, '3.25rem']} h="38px">
          {/* 这里留空，保持布局一致，但不显示标签页 */}
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
                图片
              </FormLabel>
              <Box
                position="relative"
                borderRadius="md"
                borderWidth="1px"
                borderColor="myGray.200"
                bg="myGray.25"
                width="100%"
                height="276px"
                mb={3}
                display="flex"
                flexDirection="column"
                overflow="hidden"
              >
                {/* 图片预览区域 - 优先使用previewUrl(编辑模式)，其次使用imagePreview(创建模式) */}
                {previewUrl || imagePreview ? (
                  <Box
                    flex="1"
                    overflow="hidden"
                    display="flex"
                    justifyContent="center"
                    alignItems="center"
                    position="relative"
                    onMouseEnter={() => setIsImageHovered(true)}
                    onMouseLeave={() => setIsImageHovered(false)}
                  >
                    <Image
                      src={previewUrl || imagePreview}
                      maxHeight="100%"
                      maxWidth="100%"
                      objectFit="contain"
                      alt="图片预览"
                      cursor="pointer"
                      onClick={handleImageClick}
                    />

                    {/* 图片链接显示 - 左上角 */}
                    {uploadedFileId && isImageHovered && (
                      <Box
                        position="absolute"
                        width="265px"
                        height="27.5px"
                        top="8px"
                        left="8px"
                        borderRadius="6px"
                        padding="4px 8px"
                        border="1px solid var(--Gray-Modern-200, #E8EBF0)"
                        bg="var(--White, #FFFFFF)"
                        boxShadow="0px 0px 1px 0px #13336B14, 0px 1px 2px 0px #13336B0D"
                        display="flex"
                        alignItems="center"
                        justifyContent="space-between"
                        overflow="hidden"
                      >
                        <Text fontSize="xs" color="gray.600" isTruncated maxW="200px">
                          ID: {uploadedFileId}
                        </Text>
                        <Flex gap="8px" alignItems="center">
                          <Box
                            cursor="pointer"
                            onClick={(e) => {
                              e.stopPropagation(); // 阻止冒泡
                              navigator.clipboard.writeText(uploadedFileId);
                              toast({
                                title: '已复制ID',
                                status: 'success',
                                duration: 2000,
                                isClosable: true,
                                position: 'top'
                              });
                            }}
                          >
                            <MyIcon
                              name="copy"
                              width="14px"
                              height="14px"
                              color="gray.500"
                              _hover={{ color: 'blue.500' }}
                            />
                          </Box>
                          <MyIcon name="common/link" width="12px" height="12px" color="blue.500" />
                        </Flex>
                      </Box>
                    )}

                    {/* 删除按钮 - 右下角 */}
                    {isImageHovered && (
                      <Box
                        position="absolute"
                        width="22px"
                        height="25.20833px"
                        bottom="8px"
                        right="8px"
                        borderRadius="4px"
                        padding="4px"
                        bg="white"
                        border="1px solid"
                        borderColor="var(--Gray-Modern-250, #DFE2EA)"
                        boxShadow="0px 0px 1px 0px #13336B14, 0px 1px 2px 0px #13336B0D"
                        cursor="pointer"
                        _hover={{ bg: 'gray.50' }}
                        onClick={(e) => {
                          e.stopPropagation(); // 阻止冒泡
                          setPreviewUrl('');
                          setImagePreview('');
                          setSelectFiles([]);
                          setUploadedFileId('');
                        }}
                      >
                        <MyIcon name="delete" width="14px" height="14px" color="myGray.600" />
                      </Box>
                    )}
                  </Box>
                ) : (
                  <FileSelector
                    fileType=".jpg, .jpeg, .png, .gif, .webp"
                    selectFiles={selectFiles}
                    setSelectFiles={(newFiles) => {
                      if (typeof newFiles === 'function') {
                        setSelectFiles((prevFiles) => {
                          const updatedFiles = newFiles(prevFiles);
                          handleSelectImage(updatedFiles);
                          return updatedFiles;
                        });
                      } else {
                        setSelectFiles(newFiles);
                        handleSelectImage(newFiles);
                      }
                    }}
                    onStartSelect={() => setUploading(true)}
                    onFinishSelect={() => setUploading(false)}
                    height="100%"
                    width="100%"
                  />
                )}
              </Box>

              {/* 修改标签和输入框 */}
              <FormLabel required mb={1}>
                图片描述
              </FormLabel>
              <Textarea
                resize={'none'}
                placeholder="请输入图片的描述内容"
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

              {/* 隐藏a字段，不再使用 */}
              <Textarea
                display="none"
                {...register('a', {
                  value: ''
                })}
              />
            </Flex>
          </Flex>
          {/* Index - 保持不变 */}
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
                          <DeleteIcon onClick={() => removeIndexes(i)} />
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

      {/* 文件选择器 */}
      <FileSelectDom
        onSelect={(files) => {
          // 将File[]转换为兼容的格式
          handleSelectImage(files);
        }}
      />

      {/* 多图上传错误提示 */}
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
          px={6} // 左右内边距（替代paddingLeft/paddingRight）
          py={3} // 上下内边距（替代paddingTop/paddingBottom）
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
              border="1px solid rgba(255,255,255,0.2)" // 可选：添加浅色边框增强视觉
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
              仅支持上传一张图片
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

      {/* 图片放大查看模态框 */}
      {isImageEnlarged && (
        <Modal isOpen={isImageEnlarged} onClose={handleCloseEnlargedImage} size="6xl" isCentered>
          <ModalOverlay bg="blackAlpha.600" backdropFilter="blur(10px)" />
          <ModalContent maxWidth="95vw" maxHeight="95vh" bg="transparent" boxShadow="none">
            <ModalBody display="flex" alignItems="center" justifyContent="center" p={0}>
              {/* 新增外层容器 */}
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
                {/* 图片预览区域 */}
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

                {/* 关闭按钮 - 相对于外层容器定位 */}
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
                  <MyIcon name="close2" width="24px" height="24px" color="white" />
                </Box>
              </Box>
            </ModalBody>
          </ModalContent>
        </Modal>
      )}
    </MyModal>
  );
};

export default React.memo(ImageDatasetInputModal);

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
