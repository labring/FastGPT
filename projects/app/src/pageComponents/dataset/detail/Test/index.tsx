import React from 'react';
import dynamic from 'next/dynamic';
import { Box, useDisclosure } from '@chakra-ui/react';
import { useContextSelector } from 'use-context-selector';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { SEARCH_TEST_IMAGE_UPLOAD_ENABLED } from './constants';
import TestInputPanel from './components/TestInputPanel';
import TestHistories from './components/TestHistories';
import TestResults from './components/TestResults';
import { useDatasetSearchTest } from './hooks/useDatasetSearchTest';
import { useSearchTestImages } from './hooks/useSearchTestImages';

const DatasetParamsModal = dynamic(() => import('@/components/core/app/DatasetParamsModal'));

const Test = ({ datasetId }: { datasetId: string }) => {
  const { defaultModels, feConfigs } = useSystemStore();
  const datasetDetail = useContextSelector(DatasetPageContext, (v) => v.datasetDetail);
  // Image search is only meaningful when the dataset has a vision vector model or VLM configured.
  const canUseImageSearch = !!datasetDetail.vectorModel?.vision || !!datasetDetail.vlmModel;

  const {
    ImageFileSelector,
    queryImageRefs,
    uploadingImageCount,
    showSearchTestImageEntry,
    onOpenImageSelector,
    onSelectFile,
    removeImage
  } = useSearchTestImages({
    datasetId,
    canUseImageSearch,
    uploadFileMaxSize: feConfigs?.uploadFileMaxSize
  });

  const {
    currentDatasetTestItem,
    inputText,
    searchParams,
    setValue,
    register,
    onSubmit,
    textTestIsLoading,
    setDatasetTestItem
  } = useDatasetSearchTest({
    datasetId,
    queryImageRefs: showSearchTestImageEntry ? queryImageRefs : [],
    defaultModels
  });

  const {
    isOpen: isOpenSelectMode,
    onOpen: onOpenSelectMode,
    onClose: onCloseSelectMode
  } = useDisclosure();

  // Text and image can both be search inputs; keep image-only test available for multimodal datasets.
  const canSubmit = !!inputText?.trim() || (showSearchTestImageEntry && queryImageRefs.length > 0);

  return (
    <Box h={'100%'} display={['block', 'flex']}>
      <Box
        h={['auto', '100%']}
        display={['block', 'flex']}
        flexDirection={'column'}
        flex={['unset', '0 0 468px']}
        w={['100%', '468px']}
        p={4}
        gap={6}
        borderRightWidth={['0', '1px']}
        borderRightStyle={'solid'}
        borderRightColor={'borderColor.low'}
      >
        <TestInputPanel
          canSubmit={canSubmit}
          canUseImageSearch={canUseImageSearch}
          datasetMaxToken={datasetDetail.vectorModel?.maxToken}
          isLoading={textTestIsLoading}
          onOpenImageSelector={onOpenImageSelector}
          onOpenSelectMode={onOpenSelectMode}
          onRemoveImage={removeImage}
          onSubmit={onSubmit}
          queryImageRefs={queryImageRefs}
          register={register}
          showSearchTestImageEntry={showSearchTestImageEntry}
          uploadingImageCount={uploadingImageCount}
        />

        <Box overflow={'overlay'} display={['none', 'block']}>
          <TestHistories
            datasetId={datasetId}
            datasetTestItem={currentDatasetTestItem}
            onSelect={setDatasetTestItem}
            onClearSelect={() => setDatasetTestItem(undefined)}
          />
        </Box>
      </Box>

      <Box p={4} h={['auto', '100%']} overflow={'overlay'} flex={'1 0 0'} bg={'white'}>
        <TestResults datasetTestItem={currentDatasetTestItem} />
      </Box>

      {isOpenSelectMode && (
        <DatasetParamsModal
          {...searchParams}
          maxTokens={20000}
          onClose={onCloseSelectMode}
          onSuccess={(e) => {
            setValue('searchParams', {
              ...searchParams,
              ...e
            });
          }}
        />
      )}
      {SEARCH_TEST_IMAGE_UPLOAD_ENABLED && <ImageFileSelector onSelect={onSelectFile} />}
    </Box>
  );
};

export default React.memo(Test);
