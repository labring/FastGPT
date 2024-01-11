import React, { useEffect, useMemo, useState } from 'react';
import { ImportDataComponentProps } from '@/web/core/dataset/type.d';
import { Box, Button, Flex } from '@chakra-ui/react';
import { ImportSourceItemType } from '@/web/core/dataset/type.d';
import FileSelector from '@/web/core/dataset/components/FileSelector';
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
import { useImportStore } from '../Provider';

import dynamic from 'next/dynamic';

const DataProcess = dynamic(() => import('../commonProgress/DataProcess'));
const Upload = dynamic(() => import('../commonProgress/Upload'));

type FileItemType = ImportSourceItemType & { file: File };
const fileType = '.txt, .docx, .pdf, .md, .html';

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
  const { sources, setSources } = useImportStore();
  // @ts-ignore
  const [selectFiles, setSelectFiles] = useState<FileItemType[]>(sources);
  const successFiles = useMemo(() => selectFiles.filter((item) => !item.errorMsg), [selectFiles]);

  useEffect(() => {
    setSources(successFiles);
  }, [successFiles]);

  const { mutate: onSelectFile, isLoading } = useRequest({
    mutationFn: async (files: File[]) => {
      {
        for await (const file of files) {
          const fileId = getNanoid(32);

          const { rawText } = await (() => {
            try {
              return readFileRawContent({
                file,
                uploadBase64Controller: (base64Img) =>
                  getUploadBase64ImgController({
                    base64Img,
                    type: MongoImageTypeEnum.docImage,
                    metadata: {
                      fileId
                    }
                  })
              });
            } catch (error) {
              return { rawText: '' };
            }
          })();

          const item: FileItemType = {
            id: fileId,
            file,
            rawText,
            chunks: [],
            tokens: 0,
            sourceName: file.name,
            sourceSize: formatFileSize(file.size),
            icon: getFileIcon(file.name),
            errorMsg: rawText.length === 0 ? t('common.file.Empty file tip') : ''
          };

          setSelectFiles((state) => {
            const results = [item].concat(state).slice(0, 10);
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
        maxCount={10}
        onSelectFile={onSelectFile}
      />

      {/* render files */}
      <Flex my={4} flexWrap={'wrap'} gap={5} alignItems={'center'}>
        {selectFiles.map((item) => (
          <Flex
            key={item.id}
            alignItems={'center'}
            px={4}
            py={2}
            borderRadius={'md'}
            bg={'myGray.100'}
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
              onClick={() => {
                setSelectFiles((state) => state.filter((file) => file.id !== item.id));
              }}
            />
          </Flex>
        ))}
      </Flex>

      <Box textAlign={'right'}>
        <Button isDisabled={successFiles.length === 0} onClick={goToNext}>
          {t('common.Next Step')}
        </Button>
      </Box>
    </Box>
  );
});
