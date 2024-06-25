import React, { useMemo } from 'react';
import { Box, Flex } from '@chakra-ui/react';
import { ImportSourceItemType } from '@/web/core/dataset/type';
import { useQuery } from '@tanstack/react-query';
import MyRightDrawer from '@fastgpt/web/components/common/MyDrawer/MyRightDrawer';
import { getPreviewChunks } from '@/web/core/dataset/api';
import { ImportDataSourceEnum } from '@fastgpt/global/core/dataset/constants';
import { splitText2Chunks } from '@fastgpt/global/common/string/textSplitter';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { useContextSelector } from 'use-context-selector';
import { DatasetImportContext } from '../Context';
import { importType2ReadType } from '@fastgpt/global/core/dataset/read';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';

const PreviewChunks = ({
  previewSource,
  onClose
}: {
  previewSource: ImportSourceItemType;
  onClose: () => void;
}) => {
  const { toast } = useToast();
  const { importSource, chunkSize, chunkOverlapRatio, processParamsForm } = useContextSelector(
    DatasetImportContext,
    (v) => v
  );

  const { data = [], loading: isLoading } = useRequest2(
    async () => {
      if (importSource === ImportDataSourceEnum.fileCustom) {
        const customSplitChar = processParamsForm.getValues('customSplitChar');
        const { chunks } = splitText2Chunks({
          text: previewSource.rawText || '',
          chunkLen: chunkSize,
          overlapRatio: chunkOverlapRatio,
          customReg: customSplitChar ? [customSplitChar] : []
        });
        return chunks.map((chunk) => ({
          q: chunk,
          a: ''
        }));
      }
      if (importSource === ImportDataSourceEnum.csvTable) {
        return getPreviewChunks({
          type: importType2ReadType(importSource),
          sourceId:
            previewSource.dbFileId || previewSource.link || previewSource.externalFileUrl || '',
          chunkSize,
          overlapRatio: chunkOverlapRatio,
          customSplitChar: processParamsForm.getValues('customSplitChar'),
          selector: processParamsForm.getValues('webSelector'),
          isQAImport: true
        });
      }

      return getPreviewChunks({
        type: importType2ReadType(importSource),
        sourceId:
          previewSource.dbFileId || previewSource.link || previewSource.externalFileUrl || '',
        chunkSize,
        overlapRatio: chunkOverlapRatio,
        customSplitChar: processParamsForm.getValues('customSplitChar'),
        selector: processParamsForm.getValues('webSelector'),
        isQAImport: false
      });
    },
    {
      manual: false
    }
  );

  return (
    <MyRightDrawer
      onClose={onClose}
      iconSrc={previewSource.icon}
      title={previewSource.sourceName}
      isLoading={isLoading}
      maxW={['90vw', '40vw']}
      px={0}
    >
      <Box overflowY={'auto'} px={5} fontSize={'sm'}>
        {data.map((item, index) => (
          <Box
            key={index}
            whiteSpace={'pre-wrap'}
            fontSize={'sm'}
            p={4}
            bg={index % 2 === 0 ? 'white' : 'myWhite.600'}
            mb={3}
            borderRadius={'md'}
            borderWidth={'1px'}
            borderColor={'borderColor.low'}
            boxShadow={'2'}
            _notLast={{
              mb: 2
            }}
          >
            <Box color={'myGray.900'}>{item.q}</Box>
            <Box color={'myGray.500'}>{item.a}</Box>
          </Box>
        ))}
      </Box>
    </MyRightDrawer>
  );
};

export default React.memo(PreviewChunks);
