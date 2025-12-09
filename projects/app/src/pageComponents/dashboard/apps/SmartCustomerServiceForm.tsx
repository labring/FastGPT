import React, { useMemo } from 'react';
import { Box, Flex, Text } from '@chakra-ui/react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'next-i18next';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import AIModelSelector from '@/components/Select/AIModelSelector';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import type { SelectedDatasetType } from '@fastgpt/global/core/workflow/type/io';
import { DatasetSelect } from '@/components/core/app/DatasetSelect';
import { useDatasetSelect } from '@/components/core/dataset/SelectModal';
import MyBox from '@fastgpt/web/components/common/MyBox';

export type SmartCustomerServiceFormType = {
  datasets: SelectedDatasetType;
  rerankModel: string;
};

interface SmartCustomerServiceFormProps {
  value: SmartCustomerServiceFormType;
  onChange: (data: SmartCustomerServiceFormType) => void;
}

const SmartCustomerServiceForm = ({ value, onChange }: SmartCustomerServiceFormProps) => {
  const { t } = useTranslation();
  const { reRankModelList, defaultModels } = useSystemStore();

  const { setValue, watch } = useForm<SmartCustomerServiceFormType>({
    defaultValues: value
  });

  const datasets = useMemo(() => value.datasets, [value.datasets]);
  const rerankModel = useMemo(() => value.rerankModel, [value.rerankModel]);

  // Dataset selection hooks
  const {
    paths,
    setParentId,
    searchKey,
    setSearchKey,
    datasets: datasetList,
    isFetching
  } = useDatasetSelect();

  const handleDatasetsChange = (
    newDatasets: SelectedDatasetType | ((prev: SelectedDatasetType) => SelectedDatasetType)
  ) => {
    const updatedDatasets = typeof newDatasets === 'function' ? newDatasets(datasets) : newDatasets;
    onChange({
      ...value,
      datasets: updatedDatasets
    });
  };

  const handleRerankModelChange = (newRerankModel: string) => {
    onChange({
      ...value,
      rerankModel: newRerankModel
    });
  };

  return (
    <>
      {/* 知识库选择 */}
      <Box mt={6}>
        <Flex alignItems={'center'} mb={3}>
          <FormLabel>{t('common:core.dataset.Dataset')}</FormLabel>
        </Flex>

        <MyBox isLoading={isFetching} h="353px">
          <DatasetSelect
            paths={paths}
            setParentId={setParentId}
            searchKey={searchKey}
            setSearchKey={setSearchKey}
            datasets={datasetList}
            isFetching={isFetching}
            selectedDatasets={datasets}
            setSelectedDatasets={handleDatasetsChange}
          />
        </MyBox>
      </Box>

      {/* 重排模型选择 */}
      <Box mt={6}>
        <Flex alignItems={'center'}>
          <FormLabel>{t('app:smart_customer_service_rerank_model')}</FormLabel>
        </Flex>
        <Box mt={2}>
          <AIModelSelector
            value={rerankModel}
            onChange={handleRerankModelChange}
            placeholder={t('app:smart_customer_service_select_rerank_model')}
            list={reRankModelList.map((item) => ({
              label: item.name,
              value: item.model
            }))}
          />
        </Box>
        <Text mt={2} fontSize={'xs'} color={'myGray.500'}>
          {t('app:smart_customer_service_rerank_model_warning')}
        </Text>
      </Box>
    </>
  );
};

export default SmartCustomerServiceForm;
