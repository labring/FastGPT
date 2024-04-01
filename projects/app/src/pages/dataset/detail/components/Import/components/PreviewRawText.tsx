import React from 'react';
import { Box } from '@chakra-ui/react';
import { ImportSourceItemType } from '@/web/core/dataset/type';
import { useQuery } from '@tanstack/react-query';
import { getPreviewFileContent } from '@/web/common/file/api';
import MyRightDrawer from '@fastgpt/web/components/common/MyDrawer/MyRightDrawer';
import { useImportStore } from '../Provider';
import { ImportDataSourceEnum } from '@fastgpt/global/core/dataset/constants';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { getErrText } from '@fastgpt/global/common/error/utils';

const PreviewRawText = ({
  previewSource,
  onClose
}: {
  previewSource: ImportSourceItemType;
  onClose: () => void;
}) => {
  const { toast } = useToast();
  const { importSource } = useImportStore();

  const { data, isLoading } = useQuery(
    ['previewSource', previewSource?.dbFileId],
    () => {
      if (importSource === ImportDataSourceEnum.fileLocal && previewSource.dbFileId) {
        return getPreviewFileContent({
          fileId: previewSource.dbFileId,
          csvFormat: true
        });
      }
      if (importSource === ImportDataSourceEnum.csvTable && previewSource.dbFileId) {
        return getPreviewFileContent({
          fileId: previewSource.dbFileId,
          csvFormat: false
        });
      }
      if (importSource === ImportDataSourceEnum.fileCustom) {
        return {
          previewContent: (previewSource.rawText || '').slice(0, 3000)
        };
      }

      return {
        previewContent: ''
      };
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
    >
      <Box whiteSpace={'pre-wrap'} overflowY={'auto'} fontSize={'sm'}>
        {rawText}
      </Box>
    </MyRightDrawer>
  );
};

export default React.memo(PreviewRawText);
