import React, { useEffect, useMemo, useState } from 'react';
import { ImportSourceItemType } from '@/web/core/dataset/type.d';
import { Box, Button } from '@chakra-ui/react';
import FileSelector from '../components/FileSelector';
import { useTranslation } from 'next-i18next';

import dynamic from 'next/dynamic';
import { fileDownload } from '@/web/common/file/utils';
import { RenderUploadFiles } from '../components/RenderFiles';
import { useContextSelector } from 'use-context-selector';
import { DatasetImportContext } from '../Context';

const PreviewData = dynamic(() => import('../commonProgress/PreviewData'));
const Upload = dynamic(() => import('../commonProgress/Upload'));

const fileType = '.csv';

const FileLocal = () => {
  const activeStep = useContextSelector(DatasetImportContext, (v) => v.activeStep);

  return (
    <>
      {activeStep === 0 && <SelectFile />}
      {activeStep === 1 && <PreviewData showPreviewChunks />}
      {activeStep === 2 && <Upload />}
    </>
  );
};

export default React.memo(FileLocal);

const csvTemplate = `index,content
"第一列内容","第二列内容"
"必填列","可选列。CSV 中请注意内容不能包含双引号，双引号是列分割符号"
"只会将第一和第二列内容导入，其余列会被忽略",""
"结合人工智能的演进历程,AIGC的发展大致可以分为三个阶段，即:早期萌芽阶段(20世纪50年代至90年代中期)、沉淀积累阶段(20世纪90年代中期至21世纪10年代中期),以及快速发展展阶段(21世纪10年代中期至今)。",""
"AIGC发展分为几个阶段？","早期萌芽阶段(20世纪50年代至90年代中期)、沉淀积累阶段(20世纪90年代中期至21世纪10年代中期)、快速发展展阶段(21世纪10年代中期至今)"`;

const SelectFile = React.memo(function SelectFile() {
  const { t } = useTranslation();
  const { goToNext, sources, setSources } = useContextSelector(DatasetImportContext, (v) => v);
  const [selectFiles, setSelectFiles] = useState<ImportSourceItemType[]>(
    sources.map((source) => ({
      isUploading: false,
      ...source
    }))
  );
  const [uploading, setUploading] = useState(false);

  const successFiles = useMemo(() => selectFiles.filter((item) => !item.errorMsg), [selectFiles]);

  useEffect(() => {
    setSources(successFiles);
  }, [successFiles]);

  return (
    <Box>
      <FileSelector
        fileType={fileType}
        selectFiles={selectFiles}
        setSelectFiles={setSelectFiles}
        onStartSelect={() => setUploading(true)}
        onFinishSelect={() => setUploading(false)}
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
        {t('common:core.dataset.import.Down load csv template')}
      </Box>

      {/* render files */}
      <RenderUploadFiles files={selectFiles} setFiles={setSelectFiles} />

      <Box textAlign={'right'} mt={5}>
        <Button
          isDisabled={successFiles.length === 0 || uploading}
          onClick={() => {
            setSelectFiles((state) => state.filter((item) => !item.errorMsg));
            goToNext();
          }}
        >
          {selectFiles.length > 0
            ? `${t('core.dataset.import.Total files', { total: selectFiles.length })} | `
            : ''}
          {t('common:common.Next Step')}
        </Button>
      </Box>
    </Box>
  );
});
