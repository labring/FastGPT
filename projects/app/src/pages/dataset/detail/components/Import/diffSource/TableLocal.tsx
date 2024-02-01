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
import MyTooltip from '@/components/MyTooltip';
import { useImportStore } from '../Provider';
import { useSystemStore } from '@/web/common/system/useSystemStore';

import dynamic from 'next/dynamic';
import { fileDownload } from '@/web/common/file/utils';
import { readCsvContent } from '@fastgpt/web/common/file/read/csv';

const PreviewData = dynamic(() => import('../commonProgress/PreviewData'));
const Upload = dynamic(() => import('../commonProgress/Upload'));

type FileItemType = ImportSourceItemType & { file: File };
const fileType = '.csv';
const maxSelectFileCount = 1000;

const FileLocal = ({ activeStep, goToNext }: ImportDataComponentProps) => {
  return (
    <>
      {activeStep === 0 && <SelectFile goToNext={goToNext} />}
      {activeStep === 1 && <PreviewData showPreviewChunks goToNext={goToNext} />}
      {activeStep === 2 && <Upload showPreviewChunks />}
    </>
  );
};

export default React.memo(FileLocal);

const csvTemplate = `index,content
"必填内容","可选内容。CSV 中请注意内容不能包含双引号，双引号是列分割符号"
"结合人工智能的演进历程,AIGC的发展大致可以分为三个阶段，即:早期萌芽阶段(20世纪50年代至90年代中期)、沉淀积累阶段(20世纪90年代中期至21世纪10年代中期),以及快速发展展阶段(21世纪10年代中期至今)。",""
"AIGC发展分为几个阶段？","早期萌芽阶段(20世纪50年代至90年代中期)、沉淀积累阶段(20世纪90年代中期至21世纪10年代中期)、快速发展展阶段(21世纪10年代中期至今)"`;

const SelectFile = React.memo(function SelectFile({ goToNext }: { goToNext: () => void }) {
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();
  const { sources, setSources } = useImportStore();
  // @ts-ignore
  const [selectFiles, setSelectFiles] = useState<FileItemType[]>(sources);
  const successFiles = useMemo(() => selectFiles.filter((item) => !item.errorMsg), [selectFiles]);

  useEffect(() => {
    setSources(successFiles);
  }, [successFiles]);

  const { mutate: onSelectFile, isLoading } = useRequest({
    mutationFn: async (files: SelectFileItemType[]) => {
      {
        for await (const selectFile of files) {
          const { file, folderPath } = selectFile;
          const { header, data } = await readCsvContent({ file });

          const filterData: FileItemType['chunks'] = data
            .filter((item) => item[0])
            .map((item) => ({
              q: item[0] || '',
              a: item[1] || '',
              chunkIndex: 0
            }));

          const item: FileItemType = {
            id: getNanoid(32),
            file,
            rawText: '',
            chunks: filterData,
            chunkChars: 0,
            sourceFolderPath: folderPath,
            sourceName: file.name,
            sourceSize: formatFileSize(file.size),
            icon: getFileIcon(file.name),
            errorMsg:
              header[0] !== 'index' || header[1] !== 'content' || filterData.length === 0
                ? t('core.dataset.import.Csv format error')
                : ''
          };

          setSelectFiles((state) => {
            const results = [item].concat(state).slice(0, 10);
            return results;
          });
        }
      }
    },
    errorToast: t('common.file.Select failed')
  });

  return (
    <Box>
      <FileSelector
        multiple
        maxCount={maxSelectFileCount}
        maxSize={(feConfigs?.uploadFileMaxSize || 500) * 1024 * 1024}
        isLoading={isLoading}
        fileType={fileType}
        onSelectFile={onSelectFile}
      />

      <Box
        mt={4}
        color={'primary.600'}
        textDecoration={'underline'}
        cursor={'pointer'}
        onClick={() =>
          fileDownload({
            text: csvTemplate,
            type: 'text/csv;charset=utf-8',
            filename: 'template.csv'
          })
        }
      >
        {t('core.dataset.import.Down load csv template')}
      </Box>

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
        <Button isDisabled={successFiles.length === 0 || isLoading} onClick={goToNext}>
          {selectFiles.length > 0
            ? `${t('core.dataset.import.Total files', { total: selectFiles.length })} | `
            : ''}
          {t('common.Next Step')}
        </Button>
      </Box>
    </Box>
  );
});
