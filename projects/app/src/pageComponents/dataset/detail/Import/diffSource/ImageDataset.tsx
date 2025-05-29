import React, { useEffect, useMemo, useState } from 'react';
import type { ImportSourceItemType } from '@/web/core/dataset/type.d';
import { Box, Button, Flex, Text, Input, Image, IconButton, Progress } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useContextSelector } from 'use-context-selector';
import { DatasetImportContext } from '../Context';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useRouter } from 'next/router';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { TabEnum } from '../../NavBar';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { uploadImage2Dataset } from '@/web/core/dataset/image/controller';
import { createImageDatasetCollection } from '@/web/core/dataset/image/api';
import { generateImagePreviewUrl } from '@/web/core/dataset/image/utils';
import { useUserStore } from '@/web/support/user/useUserStore';

// Extended type definition to include previewUrl
type ExtendedImportSourceItemType = ImportSourceItemType & {
  imagePreviewUrl?: string;
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
      isUploading: true
    })) as ExtendedImportSourceItemType[];

    setSelectFiles((prev) => [...prev, ...fileItems]);

    // Concurrent file upload processing
    const uploadPromises = fileItems.map(async (fileItem) => {
      try {
        const result = await uploadImage2Dataset({
          file: fileItem.file,
          datasetId,
          collectionId: parentId
        });

        try {
          // Generate preview URL
          const previewUrl = await generateImagePreviewUrl(result.id, datasetId, 'preview');

          setSelectFiles((prev) =>
            prev.map((item) =>
              item.id === fileItem.id
                ? {
                    ...item,
                    imagePreviewUrl: previewUrl,
                    dbFileId: result.id,
                    isUploading: false
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
                    dbFileId: result.id,
                    isUploading: false
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

      const collectionName = databaseName;
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
        title: error?.message || t('common:error.Create failed'),
        status: 'error'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Flex direction="column" alignItems="center" gap="36px" width="100%" mt="80px">
      <Flex direction="column" alignItems="flex-start" gap="20px" width="857px">
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
                        {file.imagePreviewUrl ? (
                          <Image
                            src={file.imagePreviewUrl}
                            alt={file.sourceName || `图片${index + 1}`}
                            width="100%"
                            height="100%"
                            objectFit="cover"
                          />
                        ) : (
                          <MyIcon
                            name="loading"
                            width="48px"
                            height="48px"
                            color="blue"
                            style={{
                              animation: 'spin 1s linear infinite'
                            }}
                          />
                        )}
                      </Flex>

                      <div
                        style={{
                          position: 'absolute',
                          top: '-8px',
                          right: '-8px',
                          zIndex: 1,
                          width: '16.667px',
                          height: '16.667px',
                          flexShrink: 0,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                        onClick={() => removeFile(index)}
                      >
                        <MyIcon
                          name="closeSolid"
                          width="20px"
                          height="16.667px"
                          style={{
                            fill: 'var(--Gray-Modern-400, #8A95A7)',
                            filter:
                              'drop-shadow(0px 0px 1.667px rgba(19, 51, 107, 0.08)) drop-shadow(0px 6.667px 6.667px rgba(19, 51, 107, 0.10))'
                          }}
                        />
                      </div>

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
                  {t('file:common.total_files', { selectFiles: { length: selectFiles.length } })}
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
              {t('common:comfirm_import')}
            </Text>
          </Button>
        </Flex>
      </Flex>
    </Flex>
  );
});
