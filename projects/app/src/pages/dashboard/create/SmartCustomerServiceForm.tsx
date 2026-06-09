import React, { useMemo } from 'react';
import { Box, Flex } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import type { SelectedDatasetType } from '@fastgpt/global/core/workflow/type/io';
import { DatasetSelect } from '@/components/core/app/DatasetSelect';
import { useDatasetSelect } from '@/components/core/dataset/SelectModal';
import MyBox from '@fastgpt/web/components/common/MyBox';

export type SmartCustomerServiceFormType = {
  datasets: SelectedDatasetType[];
};

interface SmartCustomerServiceFormProps {
  value: SmartCustomerServiceFormType;
  onChange: (data: SmartCustomerServiceFormType) => void;
}

const SmartCustomerServiceForm = ({ value, onChange }: SmartCustomerServiceFormProps) => {
  const { t } = useTranslation();

  const datasets = useMemo(() => value.datasets, [value.datasets]);

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
    newDatasets: SelectedDatasetType[] | ((prev: SelectedDatasetType[]) => SelectedDatasetType[])
  ) => {
    const updatedDatasets = typeof newDatasets === 'function' ? newDatasets(datasets) : newDatasets;
    onChange({
      ...value,
      datasets: updatedDatasets
    });
  };

  return (
    <>
      {/* 知识库选择 */}
      <Box mt={6}>
        <Flex alignItems={'center'} mb={3}>
          <FormLabel required>{t('app:select_knowledge_base')}</FormLabel>
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
    </>
  );
};

export default SmartCustomerServiceForm;
