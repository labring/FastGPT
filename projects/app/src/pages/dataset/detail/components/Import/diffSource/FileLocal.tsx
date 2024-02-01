import React, { useEffect, useMemo, useState } from 'react';
import { ImportDataComponentProps } from '@/web/core/dataset/type.d';
import { Box, Button, Flex } from '@chakra-ui/react';
import { ImportSourceItemType } from '@/web/core/dataset/type.d';
import FileSelector, { type SelectFileItemType } from '@/web/core/dataset/components/FileSelector';
import { getFileIcon } from '@fastgpt/global/common/file/icon';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { formatFileSize } from '@fastgpt/global/common/file/tools';
import { useTranslation } from 'next-i18next';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { useRequest } from '@/web/common/hooks/useRequest';
import { readFileRawContent } from '@fastgpt/web/common/file/read';
import { getUploadBase64ImgController } from '@/web/common/file/controller';
import { MongoImageTypeEnum } from '@fastgpt/global/common/file/image/constants';
import MyTooltip from '@/components/MyTooltip';
import type { PreviewRawTextProps } from '../components/PreviewRawText';
import { useImportStore } from '../Provider';
import { useSystemStore } from '@/web/common/system/useSystemStore';

import dynamic from 'next/dynamic';
import Loading from '@/components/Loading';

const DataProcess = dynamic(() => import('../commonProgress/DataProcess'), {
  loading: () => <Loading fixed={false} />
});
const Upload = dynamic(() => import('../commonProgress/Upload'));
const PreviewRawText = dynamic(() => import('../components/PreviewRawText'));

type FileItemType = ImportSourceItemType & { file: File };
const fileType = '.txt, .docx, .csv, .pdf, .md, .html';
const maxSelectFileCount = 1000;

const FileLocal = ({ activeStep, goToNext }: ImportDataComponentProps) => {
  return (
    <>
      {activeStep === 0 && <SelectFile goToNext={goToNext} />}
      {activeStep === 1 && <DataProcess showPreviewChunks goToNext={goToNext} />}
      {activeStep === 2 && <Upload showPreviewChunks />}
    </>
  );
};

export default React.memo(FileLocal);

const SelectFile = React.memo(function SelectFile({ goToNext }: { goToNext: () => void }) {
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();
  const { sources, setSources } = useImportStore();
  // @ts-ignore
  const [selectFiles, setSelectFiles] = useState<FileItemType[]>(sources);
  const successFiles = useMemo(() => selectFiles.filter((item) => !item.errorMsg), [selectFiles]);

  const [previewRaw, setPreviewRaw] = useState<PreviewRawTextProps>();

  useEffect(() => {
    setSources(successFiles);
  }, [successFiles]);

  const { mutate: onSelectFile, isLoading } = useRequest({
    mutationFn: async (files: SelectFileItemType[]) => {
      {
        for await (const selectFile of files) {
          const { file, folderPath } = selectFile;
          const relatedId = getNanoid(32);

          const { rawText } = await (() => {
            try {
              return readFileRawContent({
                file,
                uploadBase64Controller: (base64Img) =>
                  getUploadBase64ImgController({
                    base64Img,
                    type: MongoImageTypeEnum.collectionImage,
                    metadata: {
                      relatedId
                    }
                  })
              });
            } catch (error) {
              return { rawText: '' };
            }
          })();

          const item: FileItemType = {
            id: relatedId,
            file,
            rawText,
            chunks: [],
            chunkChars: 0,
            sourceFolderPath: folderPath,
            sourceName: file.name,
            sourceSize: formatFileSize(file.size),
            icon: getFileIcon(file.name),
            errorMsg: rawText.length === 0 ? t('common.file.Empty file tip') : ''
          };

          setSelectFiles((state) => {
            const results = [item].concat(state).slice(0, maxSelectFileCount);
            return results;
          });
        }
      }
    }
  });

  return (
    <Box>
      <FileSelector
        isLoading={isLoading}
        fileType={fileType}
        multiple
        maxCount={maxSelectFileCount}
        maxSize={(feConfigs?.uploadFileMaxSize || 500) * 1024 * 1024}
        onSelectFile={onSelectFile}
      />

      {/* render files */}
      <Flex my={4} flexWrap={'wrap'} gap={5} alignItems={'center'}>
        {selectFiles.map((item) => (
          <MyTooltip key={item.id} label={t('core.dataset.import.Preview raw text')}>
            <Flex
              alignItems={'center'}
              px={4}
              py={3}
              borderRadius={'md'}
              bg={'myGray.100'}
              cursor={'pointer'}
              onClick={() =>
                setPreviewRaw({
                  icon: item.icon,
                  title: item.sourceName,
                  rawText: item.rawText.slice(0, 10000)
                })
              }
            >
              <MyIcon name={item.icon as any} w={'16px'} />
              <Box ml={1} mr={3}>
                {item.sourceName}
              </Box>
              <Box mr={1} fontSize={'xs'} color={'myGray.500'}>
                {item.sourceSize}
                {item.rawText.length > 0 && (
                  <>,{t('common.Number of words', { amount: item.rawText.length })}</>
                )}
              </Box>
              {item.errorMsg && (
                <MyTooltip label={item.errorMsg}>
                  <MyIcon name={'common/errorFill'} w={'14px'} mr={3} />
                </MyTooltip>
              )}
              <MyIcon
                name={'common/closeLight'}
                w={'14px'}
                color={'myGray.500'}
                cursor={'pointer'}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectFiles((state) => state.filter((file) => file.id !== item.id));
                }}
              />
            </Flex>
          </MyTooltip>
        ))}
      </Flex>

      <Box textAlign={'right'}>
        <Button isDisabled={successFiles.length === 0 || isLoading} onClick={goToNext}>
          {selectFiles.length > 0
            ? `${t('core.dataset.import.Total files', { total: selectFiles.length })} | `
            : ''}
          {t('common.Next Step')}
        </Button>
      </Box>

      {previewRaw && <PreviewRawText {...previewRaw} onClose={() => setPreviewRaw(undefined)} />}
    </Box>
  );
});
