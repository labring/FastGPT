import React, { useState, useCallback, useMemo } from 'react';
import {
  ModalBody,
  ModalFooter,
  Button,
  Box,
  Textarea,
  Flex,
  HStack,
  VStack,
  Text
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyModal from '@fastgpt/web/components/common/MyModal';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import FileSelector, { type SelectFileItemType } from '../Import/components/FileSelector';
import type { ImportSourceItemType } from '@/web/core/dataset/type.d';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { uploadFile2DB } from '@/web/common/file/controller';
import { BucketNameEnum } from '@fastgpt/global/common/file/constants';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { formatFileSize } from '@fastgpt/global/common/file/tools';
import { getFileIcon } from '@fastgpt/global/common/file/icon';
import {
  postCheckDuplicateCollection,
  postCreateCustomFileIdCollection,
  postCreateCustomLinkCollection
} from '@/web/core/dataset/api';
import { useToast } from '@fastgpt/web/hooks/useToast';
import DuplicateConfirmModal from './DuplicateConfirmModal';

const MAX_LINKS_COUNT = 10;

const fileType = '.txt, .docx, .csv, .xlsx, .pdf, .md, .pptx';

interface GeneralImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  datasetId: string;
  onFinish?: () => void;
}

const GeneralImportModal: React.FC<GeneralImportModalProps> = ({
  isOpen,
  onClose,
  datasetId,
  onFinish
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [linkText, setLinkText] = useState('');
  const [selectFiles, setSelectFiles] = useState<ImportSourceItemType[]>([]);
  const [duplicateFiles, setDuplicateFiles] = useState<string[]>([]);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [uploadingLinks, setUploadingLinks] = useState(false);

  const successFiles = selectFiles.filter((item) => !item.errorMsg && !item.isUploading);

  // 验证链接格式
  const isValidUrl = useCallback((url: string) => {
    try {
      const urlObj = new URL(url);
      return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
    } catch {
      return false;
    }
  }, []);

  // 解析并验证链接
  const parsedLinks = useMemo(() => {
    return linkText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  }, [linkText]);

  // 验证结果
  const linkValidation = useMemo(() => {
    const invalidLinks: string[] = [];
    const validLinks: string[] = [];

    parsedLinks.forEach((link) => {
      if (isValidUrl(link)) {
        validLinks.push(link);
      } else {
        invalidLinks.push(link);
      }
    });

    return {
      validLinks,
      invalidLinks,
      totalCount: parsedLinks.length,
      isValid: invalidLinks.length === 0 && parsedLinks.length <= MAX_LINKS_COUNT
    };
  }, [parsedLinks, isValidUrl]);

  const { runAsync: onSelectFiles, loading: uploading } = useRequest2(
    async (files: SelectFileItemType[]) => {
      await Promise.all(
        files.map(async ({ fileId, file }) => {
          try {
            const { fileId: uploadFileId } = await uploadFile2DB({
              file,
              bucketName: BucketNameEnum.dataset,
              data: {
                datasetId
              },
              percentListen: (e) => {
                setSelectFiles((state) =>
                  state.map((item) =>
                    item.id === fileId
                      ? {
                          ...item,
                          uploadedFileRate: item.uploadedFileRate
                            ? Math.max(e, item.uploadedFileRate)
                            : e
                        }
                      : item
                  )
                );
              }
            });
            setSelectFiles((state) =>
              state.map((item) =>
                item.id === fileId
                  ? {
                      ...item,
                      dbFileId: uploadFileId,
                      isUploading: false,
                      uploadedFileRate: 100
                    }
                  : item
              )
            );
          } catch (error) {
            setSelectFiles((state) =>
              state.map((item) =>
                item.id === fileId
                  ? {
                      ...item,
                      isUploading: false,
                      errorMsg: getErrText(error)
                    }
                  : item
              )
            );
          }
        })
      );
    },
    {
      onBefore([files]) {
        setSelectFiles((state) => {
          return [
            ...state,
            ...files.map<ImportSourceItemType>((selectFile) => {
              const { fileId, file } = selectFile;

              return {
                id: fileId,
                createStatus: 'waiting',
                file,
                sourceName: file.name,
                sourceSize: formatFileSize(file.size),
                icon: getFileIcon(file.name),
                isUploading: true,
                uploadedFileRate: 0
              };
            })
          ];
        });
      }
    }
  );

  // 上传文件集合
  const uploadFileCollections = useCallback(
    async (files: ImportSourceItemType[], overwriteDuplicate = false) => {
      await Promise.all(
        files.map(async (file) => {
          try {
            await postCreateCustomFileIdCollection({
              datasetId,
              fileId: file.dbFileId!,
              name: file.sourceName,
              overwriteDuplicate
            });
          } catch (error) {
            console.error('Upload file error:', error);
            toast({
              title: getErrText(error),
              status: 'error'
            });
          }
        })
      );
    },
    [datasetId, toast]
  );

  // 上传链接集合
  const uploadLinkCollections = useCallback(async () => {
    if (linkValidation.validLinks.length === 0) return;

    setUploadingLinks(true);
    try {
      await Promise.all(
        linkValidation.validLinks.map(async (link) => {
          try {
            await postCreateCustomLinkCollection({
              datasetId,
              link
            });
          } catch (error) {
            console.error('Upload link error:', link, error);
          }
        })
      );
    } catch (error) {
      console.error('Batch upload links error:', error);
      toast({
        title: getErrText(error),
        status: 'error'
      });
    } finally {
      setUploadingLinks(false);
    }
  }, [datasetId, linkValidation.validLinks, toast]);

  const handleConfirm = useCallback(async () => {
    // 验证链接数量和格式
    if (parsedLinks.length > MAX_LINKS_COUNT) {
      toast({
        title: t('dataset:max_links_limit'),
        status: 'warning'
      });
      return;
    }

    if (!linkValidation.isValid && parsedLinks.length > 0) {
      toast({
        title: t('dataset:check_link_format'),
        status: 'warning'
      });
      return;
    }

    // 如果有文件，先进行重名校验
    if (successFiles.length > 0) {
      const fileNames = successFiles.map((file) => file.sourceName);
      const checkResult = await postCheckDuplicateCollection({
        datasetId,
        fileNames
      });

      if (checkResult.duplicateFileNames && checkResult.duplicateFileNames.length > 0) {
        setDuplicateFiles(checkResult.duplicateFileNames);
        setShowDuplicateModal(true);
        return;
      }
    }

    // 上传文件
    await uploadFileCollections(successFiles);

    // 上传链接
    await uploadLinkCollections();

    onFinish?.();
    onClose();
  }, [
    parsedLinks.length,
    linkValidation.isValid,
    successFiles,
    uploadFileCollections,
    uploadLinkCollections,
    onClose,
    onFinish,
    toast,
    t,
    datasetId
  ]);

  const handleCancel = useCallback(() => {
    setLinkText('');
    setSelectFiles([]);
    onClose();
  }, [onClose]);

  const handleSkipDuplicates = useCallback(async () => {
    const filesToUpload = successFiles.filter((file) => !duplicateFiles.includes(file.sourceName));

    if (filesToUpload.length === 0 && linkValidation.validLinks.length === 0) {
      toast({
        title: t('dataset:upload_other_files'),
        status: 'warning'
      });
      setShowDuplicateModal(false);
      return;
    }

    // 上传非重名文件
    await uploadFileCollections(filesToUpload);

    // 上传链接
    await uploadLinkCollections();

    setShowDuplicateModal(false);
    onFinish?.();
    onClose();
  }, [
    successFiles,
    duplicateFiles,
    linkValidation,
    uploadFileCollections,
    uploadLinkCollections,
    onClose,
    onFinish,
    t,
    toast
  ]);

  const handleContinueUpload = useCallback(async () => {
    // 上传所有文件（包括重名文件）
    await uploadFileCollections(successFiles);

    // 上传链接
    await uploadLinkCollections();

    setShowDuplicateModal(false);
    onFinish?.();
    onClose();
  }, [successFiles, uploadFileCollections, uploadLinkCollections, onClose, onFinish]);

  const handleReplaceFiles = useCallback(async () => {
    // 上传所有文件，重名文件设置 overwriteDuplicate 为 true
    await uploadFileCollections(successFiles, true);

    // 上传链接
    await uploadLinkCollections();

    setShowDuplicateModal(false);
    onFinish?.();
    onClose();
  }, [successFiles, uploadFileCollections, uploadLinkCollections, onClose, onFinish]);

  const isConfirmDisabled = parsedLinks.length === 0 && successFiles.length === 0;
  const isLoading = uploading || uploadingLinks;

  return (
    <>
      <MyModal
        iconSrc="core/dataset/fileCollection"
        iconColor="primary.600"
        title={t('dataset:general_import_title')}
        isOpen={isOpen}
        onClose={handleCancel}
        w="600px"
        h="auto"
      >
        <ModalBody py={6} px={8}>
          <Flex direction="column" gap={3}>
            {/* 读取网页 */}
            <HStack alignItems="flex-start" spacing={6}>
              <Box fontSize="sm" color="myGray.900">
                {t('dataset:read_webpage')}
              </Box>
              <Flex direction="column" flex={1} gap={2}>
                <Textarea
                  placeholder={t('dataset:link_placeholder')}
                  value={linkText}
                  onChange={(e) => setLinkText(e.target.value)}
                  rows={6}
                  bg="white"
                  fontSize="sm"
                />
                {/* 链接验证提示 */}
                {parsedLinks.length > 0 && (
                  <VStack gap={1} alignItems="flex-start" px={1}>
                    {linkValidation.totalCount > MAX_LINKS_COUNT ? (
                      <Text fontSize="xs" color="red.500">
                        {t('dataset:max_links_exceeded', { num: MAX_LINKS_COUNT })}
                      </Text>
                    ) : linkValidation.invalidLinks.length > 0 ? (
                      <Text fontSize="xs" color="red.500">
                        {t('dataset:invalid_link_format', {
                          num: linkValidation.invalidLinks.length
                        })}
                      </Text>
                    ) : null}
                  </VStack>
                )}
              </Flex>
            </HStack>

            {/* 上传文件 */}
            <HStack alignItems="flex-start" spacing={6}>
              <Box fontSize="sm" color="myGray.900">
                {t('dataset:upload_files')}
              </Box>
              <Flex direction="column" flex={1} gap={3}>
                <FileSelector
                  fileType={fileType}
                  selectFiles={selectFiles}
                  onSelectFiles={onSelectFiles}
                />

                {/* 渲染已选文件 */}
                {selectFiles.length > 0 && (
                  <VStack gap={2} alignItems="stretch">
                    {selectFiles.map((item, index) => (
                      <HStack key={item.id} w="100%">
                        <MyIcon name={item.icon as any} w="1rem" />
                        <Box fontSize="sm" color="myGray.900">
                          {item.sourceName}
                        </Box>
                        <Box fontSize="xs" color="myGray.500" flex={1}>
                          {item.sourceSize}
                        </Box>
                        {item.errorMsg ? (
                          <Box fontSize="xs" color="red.500">
                            {item.errorMsg}
                          </Box>
                        ) : item.isUploading ? (
                          <Box fontSize="xs" color="myGray.500">
                            {item.uploadedFileRate}%
                          </Box>
                        ) : (
                          <MyIconButton
                            icon="delete"
                            hoverColor="red.500"
                            hoverBg="red.50"
                            onClick={() => {
                              setSelectFiles(selectFiles.filter((_, i) => i !== index));
                            }}
                          />
                        )}
                      </HStack>
                    ))}
                  </VStack>
                )}
              </Flex>
            </HStack>
          </Flex>
        </ModalBody>

        <ModalFooter>
          <Button variant="whiteBase" mr={2} onClick={handleCancel}>
            {t('dataset:cancel')}
          </Button>
          <Button
            onClick={handleConfirm}
            isDisabled={isConfirmDisabled || isLoading}
            isLoading={isLoading}
          >
            {t('dataset:confirm')}
          </Button>
        </ModalFooter>
      </MyModal>

      {/* 重名校验弹窗 */}
      <DuplicateConfirmModal
        isOpen={showDuplicateModal}
        onClose={() => setShowDuplicateModal(false)}
        duplicateFiles={duplicateFiles}
        onSkipDuplicates={handleSkipDuplicates}
        onContinueUpload={handleContinueUpload}
        onReplaceFiles={handleReplaceFiles}
      />
    </>
  );
};

export default GeneralImportModal;
