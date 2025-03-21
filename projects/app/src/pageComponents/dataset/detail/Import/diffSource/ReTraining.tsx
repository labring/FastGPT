import React from 'react';
import { useContextSelector } from 'use-context-selector';
import { DatasetImportContext } from '../Context';

import dynamic from 'next/dynamic';
import DataProcess from '../commonProgress/DataProcess';
import { useRouter } from 'next/router';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { getDatasetCollectionById } from '@/web/core/dataset/api';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { ChunkSettingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { getCollectionIcon } from '@fastgpt/global/core/dataset/utils';
import { Box } from '@chakra-ui/react';
import { DataChunkSplitModeEnum } from '@fastgpt/global/core/dataset/constants';
import { Prompt_AgentQA } from '@fastgpt/global/core/ai/prompt/agent';

const Upload = dynamic(() => import('../commonProgress/Upload'));
const PreviewData = dynamic(() => import('../commonProgress/PreviewData'));

const ReTraining = () => {
  const router = useRouter();

  const { collectionId = '' } = router.query as {
    collectionId: string;
  };

  const activeStep = useContextSelector(DatasetImportContext, (v) => v.activeStep);
  const setSources = useContextSelector(DatasetImportContext, (v) => v.setSources);
  const processParamsForm = useContextSelector(DatasetImportContext, (v) => v.processParamsForm);

  const { loading } = useRequest2(() => getDatasetCollectionById(collectionId), {
    refreshDeps: [collectionId],
    manual: false,
    onSuccess: (collection) => {
      setSources([
        {
          dbFileId: collection.fileId,
          link: collection.rawLink,
          apiFileId: collection.apiFileId,

          createStatus: 'waiting',
          icon: getCollectionIcon(collection.type, collection.name),
          id: collection._id,
          isUploading: false,
          sourceName: collection.name,
          uploadedFileRate: 100
        }
      ]);

      processParamsForm.reset({
        customPdfParse: collection.customPdfParse,
        trainingType: collection.trainingType,
        imageIndex: collection.imageIndex,
        autoIndexes: collection.autoIndexes,

        chunkSettingMode: collection.chunkSettingMode || ChunkSettingModeEnum.auto,
        chunkSplitMode: collection.chunkSplitMode || DataChunkSplitModeEnum.size,
        embeddingChunkSize: collection.chunkSize,
        qaChunkSize: collection.chunkSize,
        indexSize: collection.indexSize || 512,
        chunkSplitter: collection.chunkSplitter,
        webSelector: collection.metadata?.webPageSelector,
        qaPrompt: collection.qaPrompt || Prompt_AgentQA.description
      });
    }
  });

  return (
    <MyBox isLoading={loading} h={'100%'}>
      <Box h={'100%'} overflow={'auto'}>
        {activeStep === 0 && <DataProcess />}
        {activeStep === 1 && <PreviewData />}
        {activeStep === 2 && <Upload />}
      </Box>
    </MyBox>
  );
};

export default React.memo(ReTraining);
