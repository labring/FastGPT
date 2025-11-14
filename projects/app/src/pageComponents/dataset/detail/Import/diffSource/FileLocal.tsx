import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { type ImportSourceItemType } from '@/web/core/dataset/type.d';
import { Box, Button } from '@chakra-ui/react';
import FileSelector, { type SelectFileItemType } from '../components/FileSelector';
import { useTranslation } from 'next-i18next';

import dynamic from 'next/dynamic';
import { RenderUploadFiles } from '../components/RenderFiles';
import { useContextSelector } from 'use-context-selector';
import { DatasetImportContext } from '../Context';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { uploadFile2DB } from '@/web/common/file/controller';
import { BucketNameEnum } from '@fastgpt/global/common/file/constants';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { formatFileSize } from '@fastgpt/global/common/file/tools';
import { getFileIcon } from '@fastgpt/global/common/file/icon';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';

const DataProcess = dynamic(() => import('../commonProgress/DataProcess'));
const PreviewData = dynamic(() => import('../commonProgress/PreviewData'));
const Upload = dynamic(() => import('../commonProgress/Upload'));

const fileType = '.txt, .docx, .csv, .xlsx, .pdf, .md, .html, .pptx';

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
  const successFiles = useMemo(() => selectFiles.filter((item) => !item.errorMsg), [selectFiles]);

  useEffect(() => {
    setSources(successFiles);
  }, [setSources, successFiles]);

  const onclickNext = useCallback(() => {
    // filter uploaded files
    setSelectFiles((state) => state.filter((item) => item.dbFileId));
    goToNext();
  }, [goToNext]);

  const { runAsync: onSelectFiles, loading: uploading } = useRequest2(
    async (files: SelectFileItemType[]) => {
      {
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
