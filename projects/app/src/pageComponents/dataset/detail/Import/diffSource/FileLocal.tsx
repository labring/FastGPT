import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { type ImportSourceItemType } from '@/web/core/dataset/type.d';
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
import { getUploadDatasetFilePresignedUrl } from '@/web/common/file/api';
import { putFileToS3 } from '@fastgpt/web/common/file/utils';
import { documentAndImageFileType } from '@fastgpt/global/common/file/constants';
import { createImageDatasetCollection } from '@/web/core/dataset/image/api';

const DataProcess = dynamic(() => import('../commonProgress/DataProcess'));
const PreviewData = dynamic(() => import('../commonProgress/PreviewData'));
const Upload = dynamic(() => import('../commonProgress/Upload'));

const fileType = documentAndImageFileType;
const imageExtensions = new Set(['.jpg', '.jpeg', '.png']);
const isImageFile = (filename: string) => {
  const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase();
  return imageExtensions.has(ext);
};

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

  const { goToNext, sources, setSources, parentId } = useContextSelector(
    DatasetImportContext,
    (v) => v
  );
  const datasetId = useContextSelector(DatasetPageContext, (v) => v.datasetId);

  const [selectFiles, setSelectFiles] = useState<ImportSourceItemType[]>(
    sources.map((source) => ({
      isUploading: false,
      ...source
    }))
  );
  const successFiles = useMemo(() => selectFiles.filter((item) => !item.errorMsg), [selectFiles]);
  // 仅文档文件需要进入后续步骤
  const docSuccessFiles = useMemo(
    () => successFiles.filter((item) => item.dbFileId),
    [successFiles]
  );

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
      const imageFiles = files.filter(({ file }) => isImageFile(file.name));
      const docFiles = files.filter(({ file }) => !isImageFile(file.name));

      // 图片文件：走图片数据集创建路径
      if (imageFiles.length > 0) {
        // 标记图片文件为上传中
        setSelectFiles((state) =>
          state.map((item) => {
            const isImg = imageFiles.some((f) => f.fileId === item.id);
            return isImg ? { ...item, isUploading: true, uploadedFileRate: 0 } : item;
          })
        );
        try {
          await createImageDatasetCollection({
            parentId,
            datasetId,
            collectionName: imageFiles.map((f) => f.file.name).join(', '),
            files: imageFiles.map((f) => f.file),
            onUploadProgress: (percent) => {
              setSelectFiles((state) =>
                state.map((item) => {
                  const isImg = imageFiles.some((f) => f.fileId === item.id);
                  return isImg ? { ...item, uploadedFileRate: percent } : item;
                })
              );
            }
          });
          // 图片上传成功，标记为完成（用 dbFileId 标记，值为 'image_dataset'）
          setSelectFiles((state) =>
            state.map((item) => {
              const isImg = imageFiles.some((f) => f.fileId === item.id);
              return isImg
                ? { ...item, isUploading: false, uploadedFileRate: 100, dbFileId: 'image_dataset' }
                : item;
            })
          );
        } catch (error) {
          setSelectFiles((state) =>
            state.map((item) => {
              const isImg = imageFiles.some((f) => f.fileId === item.id);
              return isImg ? { ...item, isUploading: false, errorMsg: t(getErrText(error)) } : item;
            })
          );
        }
      }

      // 文档文件：走原 S3 上传流程
      if (docFiles.length > 0) {
        await Promise.all(
          docFiles.map(async ({ fileId, file }) => {
            try {
              const { url, key, headers } = await getUploadDatasetFilePresignedUrl({
                filename: file.name,
                datasetId
              });

              await putFileToS3({
                url,
                file,
                headers,
                onUploadProgress: (e) => {
                  if (!e.total) return;
                  const percent = Math.round((e.loaded / e.total) * 100);
                  setSelectFiles((state) =>
                    state.map((item) =>
                      item.id === fileId
                        ? {
                            ...item,
                            uploadedFileRate: item.uploadedFileRate
                              ? Math.max(percent, item.uploadedFileRate)
                              : percent
                          }
                        : item
                    )
                  );
                },
                t,
                onSuccess: () => {
                  setSelectFiles((state) =>
                    state.map((item) =>
                      item.id === fileId
                        ? {
                            ...item,
                            dbFileId: key,
                            isUploading: false,
                            uploadedFileRate: 100
                          }
                        : item
                    )
                  );
                }
              });
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

  return (
    <Box>
      <FileSelector fileType={fileType} selectFiles={selectFiles} onSelectFiles={onSelectFiles} />

      {/* render files */}
      <RenderUploadFiles files={selectFiles} setFiles={setSelectFiles} />

      <Box textAlign={'right'} mt={5}>
        <Button isDisabled={docSuccessFiles.length === 0 || uploading} onClick={onclickNext}>
          {selectFiles.length > 0
            ? `${t('dataset:total_num_files', { total: selectFiles.length })} | `
            : ''}
          {t('common:next_step')}
        </Button>
      </Box>
    </Box>
  );
});
