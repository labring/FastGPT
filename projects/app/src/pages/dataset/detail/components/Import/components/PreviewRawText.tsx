import React from 'react';
import { Box } from '@chakra-ui/react';
import { ImportSourceItemType } from '@/web/core/dataset/type';
import { useQuery } from '@tanstack/react-query';
import { getPreviewFileContent } from '@/web/common/file/api';
import MyRightDrawer from '@fastgpt/web/components/common/MyDrawer/MyRightDrawer';
import { ImportDataSourceEnum } from '@fastgpt/global/core/dataset/constants';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { useContextSelector } from 'use-context-selector';
import { DatasetImportContext } from '../Context';
import { importType2ReadType } from '@fastgpt/global/core/dataset/read';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import axios from 'axios';

const PreviewRawText = ({
  previewSource,
  onClose
}: {
  previewSource: ImportSourceItemType;
  onClose: () => void;
}) => {
  const { toast } = useToast();
  const { importSource, processParamsForm } = useContextSelector(DatasetImportContext, (v) => v);
  const datasetDetail = useContextSelector(DatasetPageContext, (v) => v.datasetDetail);

  const { data, isLoading } = useQuery(
    ['previewSource', previewSource.dbFileId, previewSource.link, previewSource.externalFileUrl],
    async () => {
      if (importSource === ImportDataSourceEnum.fileCustom && previewSource.rawText) {
        return {
          previewContent: previewSource.rawText.slice(0, 3000)
        };
      }
      if (importSource === ImportDataSourceEnum.csvTable && previewSource.dbFileId) {
        return getPreviewFileContent({
          type: importType2ReadType(importSource),
          sourceId: previewSource.dbFileId,
          isQAImport: true
        });
      }
      if (importSource === ImportDataSourceEnum.apiDataset && previewSource.apiFileId) {
        const { apiServer } = datasetDetail;
        if (!apiServer) return Promise.reject('apiServer not found');

        const { baseUrl, authorization } = apiServer;
        const contentRes = await axios.get(
          `${baseUrl}/v1/file/content?id=${previewSource.apiFileId}`,
          {
            headers: { Authorization: authorization }
          }
        );

        const content = contentRes.data.data;

        if (content.content) {
          return {
            previewContent: content.content.slice(0, 3000)
          };
        } else if (content.previewUrl) {
          return getPreviewFileContent({
            type: importType2ReadType(importSource),
            sourceId: content.previewUrl,
            isQAImport: false,
            selector: processParamsForm.getValues('webSelector')
          });
        }
      }

      return getPreviewFileContent({
        type: importType2ReadType(importSource),
        sourceId:
          previewSource.dbFileId || previewSource.link || previewSource.externalFileUrl || '',
        isQAImport: false,
        selector: processParamsForm.getValues('webSelector')
      });
    },
    {
      onError(err) {
        toast({
          status: 'warning',
          title: getErrText(err)
        });
      }
    }
  );

  const rawText = data?.previewContent || '';

  return (
    <MyRightDrawer
      onClose={onClose}
      iconSrc={previewSource.icon}
      title={previewSource.sourceName}
      isLoading={isLoading}
      px={0}
    >
      <Box whiteSpace={'pre-wrap'} overflowY={'auto'} px={5} fontSize={'sm'}>
        {rawText}
      </Box>
    </MyRightDrawer>
  );
};

export default React.memo(PreviewRawText);
