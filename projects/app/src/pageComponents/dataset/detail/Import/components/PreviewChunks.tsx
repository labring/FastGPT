import React from 'react';
import { Box } from '@chakra-ui/react';
import { ImportSourceItemType } from '@/web/core/dataset/type';
import MyRightDrawer from '@fastgpt/web/components/common/MyDrawer/MyRightDrawer';
import { getPreviewChunks } from '@/web/core/dataset/api';
import { ImportDataSourceEnum } from '@fastgpt/global/core/dataset/constants';
import { splitText2Chunks } from '@fastgpt/global/common/string/textSplitter';
import { useContextSelector } from 'use-context-selector';
import { DatasetImportContext } from '../Context';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import { getPreviewSourceReadType } from '../utils';

const PreviewChunks = ({
  previewSource,
  onClose
}: {
  previewSource: ImportSourceItemType;
  onClose: () => void;
}) => {
  const { importSource, chunkSize, chunkOverlapRatio, processParamsForm } = useContextSelector(
    DatasetImportContext,
    (v) => v
  );
  const datasetId = useContextSelector(DatasetPageContext, (v) => v.datasetId);

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

      return getPreviewChunks({
        datasetId,
        type: getPreviewSourceReadType(previewSource),
        sourceId:
          previewSource.dbFileId ||
          previewSource.link ||
          previewSource.externalFileUrl ||
          previewSource.apiFileId ||
          '',

        chunkSize,
        overlapRatio: chunkOverlapRatio,
        customSplitChar: processParamsForm.getValues('customSplitChar'),

        selector: processParamsForm.getValues('webSelector'),
        isQAImport: importSource === ImportDataSourceEnum.csvTable,
        externalFileId: previewSource.externalFileId
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
