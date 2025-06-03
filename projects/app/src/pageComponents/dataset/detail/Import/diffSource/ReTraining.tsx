import React from 'react';
import { useContextSelector } from 'use-context-selector';
import { DatasetImportContext, defaultFormData } from '../Context';

import dynamic from 'next/dynamic';
import DataProcess from '../commonProgress/DataProcess';
import { useRouter } from 'next/router';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { getDatasetCollectionById } from '@/web/core/dataset/api';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { getCollectionIcon } from '@fastgpt/global/core/dataset/utils';
import { Box } from '@chakra-ui/react';
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
          icon: getCollectionIcon({ type: collection.type, name: collection.name }),
          id: collection._id,
          isUploading: false,
          sourceName: collection.name,
          uploadedFileRate: 100
        }
      ]);

      processParamsForm.reset({
        customPdfParse: collection.customPdfParse || false,
        trainingType: collection.trainingType,

        chunkTriggerType: collection.chunkTriggerType || defaultFormData.chunkTriggerType,
        chunkTriggerMinSize: collection.chunkTriggerMinSize || defaultFormData.chunkTriggerMinSize,

        dataEnhanceCollectionName:
          collection.dataEnhanceCollectionName || defaultFormData.dataEnhanceCollectionName,

        imageIndex: collection.imageIndex || defaultFormData.imageIndex,
        autoIndexes: collection.autoIndexes || defaultFormData.autoIndexes,

        chunkSettingMode: collection.chunkSettingMode || defaultFormData.chunkSettingMode,
        chunkSplitMode: collection.chunkSplitMode || defaultFormData.chunkSplitMode,

        paragraphChunkAIMode:
          collection.paragraphChunkAIMode || defaultFormData.paragraphChunkAIMode,
        paragraphChunkDeep: collection.paragraphChunkDeep || defaultFormData.paragraphChunkDeep,
        paragraphChunkMinSize:
          collection.paragraphChunkMinSize || defaultFormData.paragraphChunkMinSize,

        chunkSize: collection.chunkSize || defaultFormData.chunkSize,

        chunkSplitter: collection.chunkSplitter || defaultFormData.chunkSplitter,

        indexSize: collection.indexSize || defaultFormData.indexSize,

        webSelector: collection.metadata?.webPageSelector || defaultFormData.webSelector,
        qaPrompt: collection.qaPrompt || Prompt_AgentQA.description
      });
    }
  });

  return (
    <MyBox isLoading={loading} h={'100%'}>
      {!loading && (
        <Box h={'100%'} overflow={'auto'}>
          {activeStep === 0 && <DataProcess />}
          {activeStep === 1 && <PreviewData />}
          {activeStep === 2 && <Upload />}
        </Box>
      )}
    </MyBox>
  );
};

export default React.memo(ReTraining);
