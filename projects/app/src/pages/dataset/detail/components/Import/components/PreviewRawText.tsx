import React from 'react';
import { Box } from '@chakra-ui/react';
import { ImportSourceItemType } from '@/web/core/dataset/type';
import { getPreviewFileContent } from '@/web/common/file/api';
import MyRightDrawer from '@fastgpt/web/components/common/MyDrawer/MyRightDrawer';
import { ImportDataSourceEnum } from '@fastgpt/global/core/dataset/constants';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { useContextSelector } from 'use-context-selector';
import { DatasetImportContext } from '../Context';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { getPreviewSourceReadType } from '../utils';

const PreviewRawText = ({
  previewSource,
  onClose
}: {
  previewSource: ImportSourceItemType;
  onClose: () => void;
}) => {
  const { toast } = useToast();
  const { importSource, processParamsForm } = useContextSelector(DatasetImportContext, (v) => v);
  const datasetId = useContextSelector(DatasetPageContext, (v) => v.datasetId);

  const { data, loading: isLoading } = useRequest2(
    async () => {
      if (importSource === ImportDataSourceEnum.fileCustom && previewSource.rawText) {
        return {
          previewContent: previewSource.rawText.slice(0, 3000)
        };
      }

      return getPreviewFileContent({
        datasetId,
        type: getPreviewSourceReadType(previewSource),
        sourceId:
          previewSource.dbFileId ||
          previewSource.link ||
          previewSource.externalFileUrl ||
          previewSource.apiFileId ||
          '',

        isQAImport: importSource === ImportDataSourceEnum.csvTable,
        selector: processParamsForm.getValues('webSelector'),
        externalFileId: previewSource.externalFileId
      });
    },
    {
      refreshDeps: [previewSource.dbFileId, previewSource.link, previewSource.externalFileUrl],
      manual: false,
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
