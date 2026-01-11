import React, { useState, useCallback } from 'react';
import { ModalBody, ModalFooter, Button, Box, Textarea, Flex, HStack } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyModal from '@fastgpt/web/components/common/MyModal';
import FileSelector, { type SelectFileItemType } from '../Import/components/FileSelector';
import { RenderUploadFiles } from '../Import/components/RenderFiles';
import type { ImportSourceItemType } from '@/web/core/dataset/type.d';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { uploadFile2DB } from '@/web/common/file/controller';
import { BucketNameEnum } from '@fastgpt/global/common/file/constants';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { formatFileSize } from '@fastgpt/global/common/file/tools';
import { getFileIcon } from '@fastgpt/global/common/file/icon';

const fileType = '.txt, .docx, .csv, .xlsx, .pdf, .md, .html, .pptx';

interface GeneralImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm?: (data: { links: string[]; files: ImportSourceItemType[] }) => void;
  datasetId: string;
}

const GeneralImportModal: React.FC<GeneralImportModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  datasetId
}) => {
  const { t } = useTranslation();
  const [linkText, setLinkText] = useState('');
  const [selectFiles, setSelectFiles] = useState<ImportSourceItemType[]>([]);

  const successFiles = selectFiles.filter((item) => !item.errorMsg);

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

  const handleConfirm = useCallback(() => {
    const links = linkText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (onConfirm) {
      onConfirm({
        links,
        files: successFiles
      });
    }

    onClose();
  }, [linkText, successFiles, onConfirm, onClose]);

  const handleCancel = useCallback(() => {
    setLinkText('');
    setSelectFiles([]);
    onClose();
  }, [onClose]);

  const isConfirmDisabled = linkText.trim().length === 0 && successFiles.length === 0;

  return (
    <MyModal
      iconSrc="common/list"
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
            <Textarea
              flex={1}
              placeholder={t('dataset:link_placeholder')}
              value={linkText}
              onChange={(e) => setLinkText(e.target.value)}
              rows={6}
              bg="white"
              fontSize="sm"
            />
          </HStack>

          {/* 上传文件 */}
          <HStack alignItems="flex-start" spacing={6}>
            <Box fontSize="sm" color="myGray.900">
              {t('dataset:upload_files')}
            </Box>
            <FileSelector
              flex={1}
              fileType={fileType}
              selectFiles={selectFiles}
              onSelectFiles={onSelectFiles}
            />

            {/* 渲染已选文件 */}
            {selectFiles.length > 0 && (
              <Box mt={3}>
                <RenderUploadFiles files={selectFiles} setFiles={setSelectFiles} />
              </Box>
            )}
          </HStack>
        </Flex>
      </ModalBody>

      <ModalFooter>
        <Button variant="whiteBase" mr={2} onClick={handleCancel}>
          {t('dataset:cancel')}
        </Button>
        <Button
          onClick={handleConfirm}
          isDisabled={isConfirmDisabled || uploading}
          isLoading={uploading}
        >
          {t('dataset:confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default GeneralImportModal;
