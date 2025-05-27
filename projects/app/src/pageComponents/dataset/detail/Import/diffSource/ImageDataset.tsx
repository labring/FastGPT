import React, { useEffect, useMemo, useState } from 'react';
import type { ImportSourceItemType } from '@/web/core/dataset/type.d';
import { Box, Button, Flex, Text, Input, Image, IconButton, Progress } from '@chakra-ui/react';
import FileSelector from '../components/FileSelector';
import { useTranslation } from 'next-i18next';
import { useContextSelector } from 'use-context-selector';
import { DatasetImportContext } from '../Context';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useRouter } from 'next/router';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { TabEnum } from '../../NavBar';
import { BucketNameEnum, ReadFileBaseUrl } from '@fastgpt/global/common/file/constants';
import { postCreateDatasetFileCollection, postInsertData2Dataset } from '@/web/core/dataset/api';
import {
  DatasetCollectionDataProcessModeEnum,
  ChunkSettingModeEnum,
  DatasetCollectionTypeEnum
} from '@fastgpt/global/core/dataset/constants';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { postGetFileToken } from '@/web/common/file/api';
import { uploadImage2Dataset } from '@/web/common/image/controller';
import { createImageDatasetCollection } from '@/web/common/image/api';
import { generateImagePreviewUrl } from '@/web/common/file/api';
import { useUserStore } from '@/web/support/user/useUserStore';

// Extended type definition to include previewUrl
type ExtendedImportSourceItemType = ImportSourceItemType & {
  previewUrl?: string;
  file: File;
};

const fileType = '.jpg, .jpeg, .png, .gif, .webp';

const ImageDataset = () => {
  return <SelectFile />;
};

export default React.memo(ImageDataset);

const SelectFile = React.memo(function SelectFile() {
  const { t } = useTranslation();
  const router = useRouter();
  const { toast } = useToast();
  const { userInfo } = useUserStore();
  const { sources, setSources, parentId } = useContextSelector(DatasetImportContext, (v) => v);
  const [selectFiles, setSelectFiles] = useState<ExtendedImportSourceItemType[]>(
    sources.map((source) => ({
      isUploading: false,
      ...source,
      file: source.file as File
    }))
  );
  const [uploading, setUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [databaseName, setDatabaseName] = useState('');
  const successFiles = useMemo(() => selectFiles.filter((item) => !item.errorMsg), [selectFiles]);

  useEffect(() => {
    setSources(successFiles);
  }, [setSources, successFiles]);

  const removeFile = (index: number) => {
    setSelectFiles((prev) => {
      const newFiles = [...prev];
      newFiles.splice(index, 1);
      return newFiles;
    });
  };

  const handleFileSelection = async (files: File[]) => {
    if (files.length === 0) return;

    const datasetId = router.query.datasetId as string;
    if (!datasetId) {
      toast({
        title: t('file:common.Dataset ID not found'),
        status: 'error'
      });
      return;
    }

    const fileItems = files.map((file) => ({
      id: getNanoid(),
      createStatus: 'waiting',
      file: file,
      sourceName: file.name,
      isUploading: true,
      uploadedFileRate: 0
    })) as ExtendedImportSourceItemType[];

    setSelectFiles((prev) => [...prev, ...fileItems]);

    // Concurrent file upload processing
    const uploadPromises = fileItems.map(async (fileItem) => {
      try {
        const result = await uploadImage2Dataset({
          file: fileItem.file,
          datasetId,
          collectionId: parentId,
          percentListen: (percent) => {
            setSelectFiles((prev) =>
              prev.map((item) =>
                item.id === fileItem.id ? { ...item, uploadedFileRate: percent } : item
              )
            );
          }
        });

        const { id: imageId } = result;

        try {
          // Generate preview URL
          const previewUrl = await generateImagePreviewUrl(
            imageId,
            datasetId,
            userInfo?.team?.teamId ?? '',
            'preview'
          );

          setSelectFiles((prev) =>
            prev.map((item) =>
              item.id === fileItem.id
                ? {
                    ...item,
                    previewUrl,
                    dbFileId: imageId,
                    isUploading: false,
                    uploadedFileRate: 100
                  }
                : item
            )
          );
        } catch (error) {
          // If preview URL generation fails, still update state without preview URL
          setSelectFiles((prev) =>
            prev.map((item) =>
              item.id === fileItem.id
                ? {
                    ...item,
                    dbFileId: imageId,
                    isUploading: false,
                    uploadedFileRate: 100
                  }
                : item
            )
          );
        }
      } catch (error) {
        setSelectFiles((prev) =>
          prev.map((item) =>
            item.id === fileItem.id ? { ...item, isUploading: false, errorMsg: '上传失败' } : item
          )
        );
      }
    });

    // Wait for all uploads to complete
    await Promise.allSettled(uploadPromises);
  };

  const handleUploadAndCreateCollection = async () => {
    if (selectFiles.length === 0) {
      toast({
        title: t('file:Action'),
        status: 'warning'
      });
      return;
    }

    const pendingFiles = selectFiles.filter((file) => file.isUploading);
    if (pendingFiles.length > 0) {
      toast({
        title: t('file:Please wait for all files to upload'),
        status: 'warning'
      });
      return;
    }

    try {
      setIsSubmitting(true);

      const collectionName =
        databaseName ||
        t('common:core.dataset.Image collection') +
          `_${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '_')}`;
      const datasetId = router.query.datasetId as string;

      const imageIds = [];
      const filesInfo = [];

      for (const file of selectFiles) {
        if (file.dbFileId && !file.errorMsg) {
          imageIds.push(file.dbFileId);
          filesInfo.push({
            name: file.file.name,
            size: file.file.size,
            type: file.file.type
          });
        }
      }

      if (imageIds.length > 0) {
        const result = await createImageDatasetCollection({
          datasetId,
          collectionName,
          imageIds,
          filesInfo
        });

        toast({
          title: t('file:count.core.dataset.collection.Create Success', {
            count: result.successCount
          }),
          status: 'success'
        });

        if (result.successCount < result.totalCount) {
          toast({
            title: `部分图片处理失败 (${result.totalCount - result.successCount}/${result.totalCount})`,
            status: 'warning'
          });
        }

        router.replace({
          query: {
            datasetId: router.query.datasetId,
            currentTab: TabEnum.collectionCard
          }
        });
      } else {
        toast({
          title: t('file:All images import failed'),
          status: 'error'
        });
      }
    } catch (error: any) {
      toast({
        title: error?.message || t('common:common.Create Failed'),
        status: 'error'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Flex direction="column" alignItems="center" gap="36px" width="100%" mt="80px">
      <Flex direction="column" alignItems="flex-start" gap="20px" width="782px">
        <Flex alignItems="center" gap="76px" width="100%">
          <Text
            color="var(--light-general-on-surface, var(--Gray-Modern-900, #111824))"
            fontFamily='"PingFang SC"'
            fontSize="14px"
            fontStyle="normal"
            fontWeight={500}
            lineHeight="20px"
            letterSpacing="0.1px"
            py="4px"
            width="76px"
            whiteSpace="nowrap"
          >
            {t('common:core.dataset.collection.Collection name')}
          </Text>

          <Input
            width="398px"
            height="36px"
            borderRadius="8px"
            borderWidth="1px"
            bg="var(--Gray-Modern-50, #F7F8FA)"
            border="1px solid var(--Gray-Modern-200, #E8EBF0)"
            placeholder={t('common:core.dataset.collection.Collection name')}
            value={databaseName}
            onChange={(e) => setDatabaseName(e.target.value)}
          />
        </Flex>

        <Flex alignItems="flex-start" gap="76px" width="100%">
          <Text
            color="var(--light-general-on-surface, var(--Gray-Modern-900, #111824))"
            fontFamily='"PingFang SC"'
            fontSize="14px"
            fontStyle="normal"
            fontWeight={500}
            lineHeight="20px"
            letterSpacing="0.1px"
            py="4px"
            width="76px"
            whiteSpace="nowrap"
          >
            {t('common:core.dataset.collection.Collection raw text')}
          </Text>

          <Flex direction="column" width="706px" alignItems="flex-start" gap="8px">
            <Box width="100%" height="180px">
              <Flex
                width="100%"
                height="180px"
                flexDirection="column"
                alignItems="center"
                justifyContent="center"
                gap="10px"
                borderWidth="1.5px"
                borderStyle="dashed"
                borderColor="borderColor.high"
                borderRadius="md"
                bg={uploading ? 'gray.50' : 'white'}
                _hover={!uploading ? { bg: 'primary.50', borderColor: 'primary.600' } : {}}
                cursor={uploading ? 'default' : 'pointer'}
                onClick={() => !uploading && document.getElementById('file-upload')?.click()}
              >
                <input
                  id="file-upload"
                  type="file"
                  multiple
                  accept={fileType}
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    if (files.length > 0) {
                      setUploading(true);
                      handleFileSelection(files).finally(() => {
                        setUploading(false);
                        e.target.value = '';
                      });
                    }
                  }}
                  style={{ display: 'none' }}
                />

                <Flex direction="column" alignItems="center" gap="8px">
                  <MyIcon name="common/uploadFileFill" w="32px" h="32px" />
                  <Flex direction="column" alignItems="center" gap="4px" textAlign="center">
                    <Text fontWeight="500" fontSize="14px" letterSpacing="0.1px" lineHeight="20px">
                      {uploading ? t('file:uploading') : t('file:select_and_drag_file_tip')}
                    </Text>
                    <Text color="myGray.500" fontSize="12px" lineHeight="16px" textAlign="center">
                      {t('file:support_file_type', { fileType })}
                      <br />
                      {t('file:support_max_count', { maxCount: 100 })}，
                      {t('file:support_max_size', { maxSize: '20 MB' })}
                    </Text>
                  </Flex>
                </Flex>
              </Flex>
            </Box>

            {selectFiles.length > 0 && (
              <Box
                width="100%"
                height="267px"
                padding="9px 0"
                overflowY="auto"
                border="1px solid var(--Gray-Modern-200, #E8EBF0)"
                borderRadius="8px"
                py="8px"
              >
                <Flex width="696px" margin="0 auto" flexWrap="wrap" gap="8px">
                  {selectFiles.map((file, index) => (
                    <Box key={file.id || index} position="relative" width="80px" height="80px">
                      <Flex
                        width="80px"
                        height="80px"
                        borderRadius="8px"
                        border="1.071px solid var(--Gray-Modern-200, #E8EBF0)"
                        alignItems="center"
                        justifyContent="center"
                        background="var(--White, #FFF)"
                        boxShadow="0px 4.286px 10.714px 0px rgba(19, 51, 107, 0.08), 0px 0px 1.071px 0px rgba(19, 51, 107, 0.08)"
                        overflow="hidden"
                      >
                        {file.previewUrl ? (
                          <Image
                            src={file.previewUrl}
                            alt={file.sourceName || `图片${index + 1}`}
                            width="100%"
                            height="100%"
                            objectFit="cover"
                          />
                        ) : (
                          <Flex
                            width="100%"
                            height="100%"
                            bg="var(--Gray-Modern-50, #F7F8FA)"
                            alignItems="center"
                            justifyContent="center"
                          >
                            <MyIcon name="file/fill/file" width="24px" height="24px" />
                          </Flex>
                        )}
                      </Flex>

                      {file.isUploading && (
                        <Box
                          position="absolute"
                          bottom="0"
                          left="0"
                          width="100%"
                          display="flex"
                          justifyContent="center"
                          padding="2px"
                        >
                          <Box
                            width="78.67px"
                            height="78.67px"
                            flexShrink={0}
                            display="flex"
                            flexDirection="column"
                            alignItems="center"
                            justifyContent="center"
                            bg="rgba(255, 255, 255, 0.7)"
                            borderRadius="4px"
                          >
                            <MyIcon
                              name="loading"
                              width="48px"
                              height="48px"
                              color="blue"
                              style={{
                                animation: 'spin 1s linear infinite'
                              }}
                            />
                          </Box>
                        </Box>
                      )}

                      <IconButton
                        aria-label={t('file:delete_image')}
                        icon={<MyIcon name="soliderror" width="12px" height="12px" color="white" />}
                        position="absolute"
                        top="-10px"
                        right="-10px"
                        size="xs"
                        bg="var(--Gray-Modern-400, #8A95A7)"
                        borderRadius="full"
                        boxSize="7px"
                        p={0}
                        display="flex"
                        alignItems="center"
                        justifyContent="center"
                        onClick={() => removeFile(index)}
                        zIndex={1}
                        _hover={{
                          bg: 'red.500',
                          transform: 'scale(1.2)',
                          transition: 'all 0.2s ease'
                        }}
                      />

                      {file.errorMsg && (
                        <Box
                          position="absolute"
                          top="0"
                          left="0"
                          width="100%"
                          height="100%"
                          bg="rgba(255,0,0,0.2)"
                          display="flex"
                          alignItems="center"
                          justifyContent="center"
                        >
                          <MyIcon name="close" color="red.500" width="24px" height="24px" />
                        </Box>
                      )}
                    </Box>
                  ))}
                </Flex>
              </Box>
            )}
          </Flex>
        </Flex>

        <Flex width="100%" justifyContent="flex-end" mt="12px">
          <Button
            display="inline-flex"
            alignItems="center"
            justifyContent="center"
            gap="8px"
            px="14px"
            py="8px"
            bg="var(--Royal-Blue-600, #3370FF)"
            color="white"
            borderRadius="sm"
            boxShadow="0px 0px 1px 0px #13336B14, 0px 1px 2px 0px #13336B0D"
            height="36px"
            isDisabled={selectFiles.length === 0 || uploading}
            onClick={handleUploadAndCreateCollection}
            isLoading={isSubmitting}
          >
            {selectFiles.length > 0 && (
              <>
                <Text
                  as="span"
                  fontWeight="500"
                  fontSize="14px"
                  letterSpacing="0.1px"
                  lineHeight="20px"
                >
                  共{selectFiles.length}个文件
                </Text>
                <Box width="1px" height="11px" bg="white" />
              </>
            )}
            <Text
              as="span"
              fontWeight="500"
              fontSize="14px"
              letterSpacing="0.1px"
              lineHeight="20px"
            >
              确认导入
            </Text>
          </Button>
        </Flex>
      </Flex>
    </Flex>
  );
});
