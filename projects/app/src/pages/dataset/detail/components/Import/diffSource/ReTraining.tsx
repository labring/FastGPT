import React from 'react';
import { useContextSelector } from 'use-context-selector';
import { DatasetImportContext } from '../Context';

import dynamic from 'next/dynamic';
import DataProcess from '../commonProgress/DataProcess';
import { useRouter } from 'next/router';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { getDatasetCollectionById } from '@/web/core/dataset/api';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { ImportProcessWayEnum } from '@/web/core/dataset/constants';
import { getCollectionIcon } from '@fastgpt/global/core/dataset/utils';

const Upload = dynamic(() => import('../commonProgress/Upload'));

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
        mode: collection.trainingType,
        way: ImportProcessWayEnum.auto,
        embeddingChunkSize: collection.chunkSize,
        qaChunkSize: collection.chunkSize,
        customSplitChar: collection.chunkSplitter,
        qaPrompt: collection.qaPrompt,
        webSelector: collection.metadata?.webSelector
      });
    }
  });

  return (
    <MyBox isLoading={loading} h={'100%'} overflow={'auto'}>
      {activeStep === 0 && <DataProcess showPreviewChunks={true} />}
      {activeStep === 1 && <Upload />}
    </MyBox>
  );
};

export default React.memo(ReTraining);
