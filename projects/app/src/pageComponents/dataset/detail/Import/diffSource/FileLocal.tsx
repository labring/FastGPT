import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type ImportSourceItemType } from '@/web/core/dataset/type';
import { Box, Button } from '@chakra-ui/react';
import FileSelector, { type SelectFileItemType } from '../components/FileSelector';
import { useTranslation } from 'next-i18next';

import dynamic from 'next/dynamic';
import { RenderUploadFiles } from '../components/RenderFiles';
import { useContextSelector } from 'use-context-selector';
import { DatasetImportContext } from '../Context';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { formatFileSize } from '@fastgpt/global/common/file/tools';
import { getFileIcon } from '@fastgpt/global/common/file/icon';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import { getUploadDatasetFilePresignedUrl } from '@/web/core/dataset/api/file';
import { S3FileUploader } from '@fastgpt/web/common/file/uploader';
import { documentFileType } from '@fastgpt/global/common/file/constants';

const DataProcess = dynamic(() => import('../commonProgress/DataProcess'));
const PreviewData = dynamic(() => import('../commonProgress/PreviewData'));
const Upload = dynamic(() => import('../commonProgress/Upload'));

const FileLocal = () => {
  const activeStep = useContextSelector(DatasetImportContext, (v) => v.activeStep);

  return (
    <>
      {activeStep === 0 && <SelectFile />}
      {activeStep === 1 && <DataProcess />}
      {activeStep === 2 && <PreviewData />}
      {activeStep === 3 && <Upload />}
    </>
  );
};

export default React.memo(FileLocal);

const SelectFile = React.memo(function SelectFile() {
  const { t } = useTranslation();

  const { goToNext, sources, setSources } = useContextSelector(DatasetImportContext, (v) => v);
  const datasetId = useContextSelector(DatasetPageContext, (v) => v.datasetId);

  const [selectFiles, setSelectFiles] = useState<ImportSourceItemType[]>(
    sources.map((source) => ({
      isUploading: false,
      ...source
    }))
  );
  const uploadControllers = useRef(new Map<string, AbortController>());
  const successFiles = useMemo(() => selectFiles.filter((item) => !item.errorMsg), [selectFiles]);

  useEffect(() => {
    return () => {
      uploadControllers.current.forEach((controller) => controller.abort());
      uploadControllers.current.clear();
    };
  }, []);

  useEffect(() => {
    setSources(successFiles);
  }, [setSources, successFiles]);

  const onclickNext = useCallback(() => {
    // filter uploaded files
    setSelectFiles((state) => state.filter((item) => item.dbFileId));
    goToNext();
  }, [goToNext]);

  const { runAsync: onSelectFiles, loading: uploading } = useRequest(
    async (files: SelectFileItemType[]) => {
      {
        await Promise.all(
          files.map(async ({ fileId, file }) => {
            const controller = new AbortController();
            uploadControllers.current.set(fileId, controller);

            try {
              const uploadResult = await getUploadDatasetFilePresignedUrl(
                {
                  filename: file.name,
                  datasetId,
                  size: file.size
                },
                {
                  cancelToken: controller
                }
              );

              const updateProgress = (loaded: number, total: number) => {
                if (!total) return;
                const percent = Math.min(100, Math.round((loaded / total) * 100));
                setSelectFiles((state) =>
                  state.map((item) =>
                    item.id === fileId
                      ? {
                          ...item,
                          uploadedFileRate: Math.max(item.uploadedFileRate ?? 0, percent)
                        }
                      : item
                  )
                );
              };

              const uploader = new S3FileUploader({
                ...uploadResult,
                file,
                signal: controller.signal,
                onProgress: updateProgress,
                t
              });
              if (controller.signal.aborted) {
                await uploader.abort();
                return;
              }
              await uploader.upload();

              setSelectFiles((state) =>
                state.map((item) =>
                  item.id === fileId
                    ? {
                        ...item,
                        dbFileId: uploadResult.key,
                        isUploading: false,
                        uploadedFileRate: 100
                      }
                    : item
                )
              );
            } catch (error) {
              if (controller.signal.aborted) return;

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
            } finally {
              uploadControllers.current.delete(fileId);
            }
          })
        );
      }
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

  const cancelUpload = useCallback((fileId: string) => {
    uploadControllers.current.get(fileId)?.abort();
    setSelectFiles((state) => state.filter((file) => file.id !== fileId));
  }, []);

  return (
    <Box>
      <FileSelector
        fileType={documentFileType}
        selectFiles={selectFiles}
        onSelectFiles={onSelectFiles}
      />

      {/* render files */}
      <RenderUploadFiles
        files={selectFiles}
        setFiles={setSelectFiles}
        onCancelUpload={cancelUpload}
      />

      <Box textAlign={'right'} mt={5}>
        <Button isDisabled={successFiles.length === 0 || uploading} onClick={onclickNext}>
          {selectFiles.length > 0
            ? `${t('dataset:total_num_files', { total: selectFiles.length })} | `
            : ''}
          {t('common:next_step')}
        </Button>
      </Box>
    </Box>
  );
});
