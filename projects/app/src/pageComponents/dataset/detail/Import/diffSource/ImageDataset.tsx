import React, { useEffect, useMemo, useState } from 'react';
import { ImportSourceItemType } from '@/web/core/dataset/type.d';
import { Box, Button, Flex, Text, Input, Image, IconButton, Progress } from '@chakra-ui/react';
import FileSelector from '../components/FileSelector';
import { useTranslation } from 'next-i18next';
import { useContextSelector } from 'use-context-selector';
import { DatasetImportContext } from '../Context';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useRouter } from 'next/router';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { TabEnum } from '../../NavBar';
import { uploadFile2DB } from '@/web/common/file/controller';
import { BucketNameEnum } from '@fastgpt/global/common/file/constants';
import { postCreateDatasetFileCollection, postInsertData2Dataset } from '@/web/core/dataset/api';
import {
  DatasetCollectionDataProcessModeEnum,
  ChunkSettingModeEnum,
  DatasetCollectionTypeEnum
} from '@fastgpt/global/core/dataset/constants';
import { getNanoid } from '@fastgpt/global/common/string/tools';

// 扩展类型定义以包含预览URL
type ExtendedImportSourceItemType = ImportSourceItemType & {
  previewUrl?: string;
  file: File; // 确保文件始终存在
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
  const { sources, setSources, parentId } = useContextSelector(DatasetImportContext, (v) => v);
  const [selectFiles, setSelectFiles] = useState<ExtendedImportSourceItemType[]>(
    sources.map((source) => ({
      isUploading: false,
      ...source,
      file: source.file as File // 确保类型正确
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

  // 为组件添加自定义的处理文件选择的方法
  const handleFileSelection = async (files: File[]) => {
    if (files.length === 0) return;

    const datasetId = router.query.datasetId as string;
    if (!datasetId) {
      toast({
        title: '数据集ID不存在',
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

    for (let i = 0; i < fileItems.length; i++) {
      const fileItem = fileItems[i];

      uploadFile2DB({
        file: fileItem.file,
        bucketName: BucketNameEnum.dataset,
        data: { datasetId },
        percentListen: (percent) => {
          setSelectFiles((prev) =>
            prev.map((item) =>
              item.id === fileItem.id ? { ...item, uploadedFileRate: percent } : item
            )
          );
        }
      })
        .then((response) => {
          const { fileId, previewUrl } = response;

          setSelectFiles((prev) => {
            const updated = prev.map((item) =>
              item.id === fileItem.id
                ? {
                    ...item,
                    previewUrl,
                    dbFileId: fileId,
                    isUploading: false,
                    uploadedFileRate: 100
                  }
                : item
            );
            return updated;
          });
        })
        .catch((error) => {
          setSelectFiles((prev) =>
            prev.map((item) =>
              item.id === fileItem.id ? { ...item, isUploading: false, errorMsg: '上传失败' } : item
            )
          );
        });
    }
  };

  // 上传图片到数据集的函数
  const uploadImageToDataset = async (file: File, collectionName?: string, index?: number) => {
    const datasetId = router.query.datasetId as string;
    if (!datasetId) {
      throw new Error('数据集ID不存在');
    }

    try {
      const data = {
        datasetId
      };

      const { fileId, previewUrl } = await uploadFile2DB({
        file,
        bucketName: BucketNameEnum.dataset,
        data,
        metadata: {
          collectionName: collectionName
            ? `${collectionName}_${index || 0}_${file.name}`
            : file.name,
          fileType: 'image',
          mimeType: file.type
        },
        percentListen: (percent) => {
          setSelectFiles((prev) =>
            prev.map((item) =>
              item.file === file
                ? { ...item, uploadedFileRate: percent, isUploading: percent < 100 }
                : item
            )
          );
        }
      });

      if (fileId) {
        const response = await fetch('/api/core/dataset/collection/create', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            datasetId,
            parentId,
            fileId,
            name: collectionName ? `${collectionName}_${index || 0}_${file.name}` : file.name,
            type: DatasetCollectionTypeEnum.file,
            rawText: '',
            trainingType: DatasetCollectionDataProcessModeEnum.chunk,
            chunkSettingMode: ChunkSettingModeEnum.auto
          })
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || '创建集合失败');
        }

        const result = await response.json();
        const collectionId = result.data;

        if (!collectionId) {
          throw new Error('创建集合失败：无法获取集合ID');
        }

        for (let i = 0; i < selectFiles.length; i++) {
          try {
            const currentFile = selectFiles[i];
            if (!currentFile.dbFileId) continue;

            const insertParams = {
              collectionId: collectionId,
              q: `图片第${i + 1}张`,
              a: '',
              chunkIndex: i,
              imageFileId: currentFile.dbFileId
            };

            const dataItemResult = await postInsertData2Dataset(insertParams);
          } catch (error) {}
        }

        toast({
          title: `成功导入图片集合，共${selectFiles.length}张图片`,
          status: 'success'
        });

        router.replace({
          query: {
            datasetId: router.query.datasetId,
            currentTab: TabEnum.collectionCard
          }
        });
      } else {
        toast({
          title: '所有图片导入失败',
          status: 'error'
        });
      }
    } catch (error: any) {
      toast({
        title: error?.message || t('common:common.Create Failed'),
        status: 'error'
      });
    }
  };

  // 处理确认导入
  const handleUploadAndCreateCollection = async () => {
    if (selectFiles.length === 0) {
      toast({
        title: '请选择要上传的图片',
        status: 'warning'
      });
      return;
    }

    const pendingFiles = selectFiles.filter((file) => file.isUploading);
    if (pendingFiles.length > 0) {
      toast({
        title: '请等待所有文件上传完成',
        status: 'warning'
      });
      return;
    }

    try {
      setIsSubmitting(true);

      const collectionName =
        databaseName || `图片集合_${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '_')}`;
      const datasetId = router.query.datasetId as string;

      const imageRefs = [];
      const filesInfo = [];

      for (const file of selectFiles) {
        if (file.dbFileId && !file.errorMsg) {
          imageRefs.push(file.dbFileId);
          filesInfo.push({
            name: file.file.name,
            size: file.file.size,
            type: file.file.type
          });
        }
      }

      if (imageRefs.length > 0) {
        try {
          const response = await fetch('/api/core/dataset/collection/create', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              datasetId,
              parentId,
              fileIds: imageRefs,
              name: collectionName,
              type: DatasetCollectionTypeEnum.file,
              rawText: JSON.stringify({
                images: imageRefs.length,
                files: filesInfo
              }),
              trainingType: DatasetCollectionDataProcessModeEnum.chunk,
              chunkSettingMode: ChunkSettingModeEnum.auto,
              metadata: {
                imageCount: imageRefs.length,
                isImageCollection: true
              }
            })
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || '创建集合失败');
          }

          const result = await response.json();
          const collectionId = result.data;

          if (!collectionId) {
            throw new Error('创建集合失败：无法获取集合ID');
          }

          for (let i = 0; i < imageRefs.length; i++) {
            try {
              const insertParams = {
                collectionId: collectionId,
                q: `图片第${i + 1}张`,
                a: ``,
                chunkIndex: i,
                imageFileId: imageRefs[i]
              };

              const dataItemResult = await postInsertData2Dataset(insertParams);
            } catch (error) {}
          }

          toast({
            title: `成功导入图片集合，共${imageRefs.length}张图片`,
            status: 'success'
          });

          router.replace({
            query: {
              datasetId: router.query.datasetId,
              currentTab: TabEnum.collectionCard
            }
          });
        } catch (error: any) {
          toast({
            title: error?.message || '创建集合失败',
            status: 'error'
          });
        }
      } else {
        toast({
          title: '所有图片导入失败',
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
            数据集名称
          </Text>

          <Input
            width="398px"
            height="36px"
            borderRadius="8px"
            borderWidth="1px"
            bg="var(--Gray-Modern-50, #F7F8FA)"
            border="1px solid var(--Gray-Modern-200, #E8EBF0)"
            placeholder="数据集名称"
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
            数据集内容
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
                      {uploading ? '正在上传...' : '点击或拖拽文件到此处上传'}
                    </Text>
                    <Text color="myGray.500" fontSize="12px" lineHeight="16px" textAlign="center">
                      支持文件类型: {fileType} 类型文件
                      <br />
                      最多支持 100 个文件，单个文件最大 20 MB
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
                        aria-label="删除图片"
                        icon={<MyIcon name="soliderror" width="12px" height="12px" color="white" />}
                        position="absolute"
                        top="-10px"
                        right="-10px"
                        size="xs"
                        bg="var(--Gray-Modern-400, #8A95A7)"
                        borderRadius="full"
                        boxSize="17px"
                        minWidth="17px"
                        height="17px"
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
