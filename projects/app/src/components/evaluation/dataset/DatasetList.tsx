import React, { useEffect } from 'react';
import {
  Box,
  Button,
  Flex,
  IconButton,
  Table,
  TableContainer,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  Text
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';
import PopoverConfirm from '@fastgpt/web/components/common/MyPopover/PopoverConfirm';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { usePagination } from '@fastgpt/web/hooks/usePagination';
import { formatTime2YMDHM } from '@fastgpt/global/common/string/time';
import { useEvaluationStore } from '@/web/core/evaluation/store/evaluation';
import { getDatasetList, deleteDataset } from '@/web/core/evaluation/dataset';
import type { EvalDatasetSchemaType } from '@fastgpt/global/core/evaluation/type';
import { useToast } from '@fastgpt/web/hooks/useToast';

interface DatasetListProps {
  searchKey: string;
  onSearchChange: (value: string) => void;
}

const DatasetList: React.FC<DatasetListProps> = ({ searchKey, onSearchChange }) => {
  const { t } = useTranslation();
  const { toast } = useToast();

  const { datasets, setDatasets, removeDataset, openDatasetModal } = useEvaluationStore();

  const {
    data: datasetList,
    Pagination,
    getData: fetchData,
    total,
    pageSize
  } = usePagination(
    (params) =>
      getDatasetList({
        ...params,
        searchKey
      }),
    {
      defaultPageSize: 20,
      params: {},
      refreshDeps: [searchKey]
    }
  );

  useEffect(() => {
    if (datasetList) {
      setDatasets(datasetList);
    }
  }, [datasetList, setDatasets]);

  const { runAsync: onDeleteDataset } = useRequest2(deleteDataset, {
    onSuccess: (_, [datasetId]) => {
      removeDataset(datasetId);
      fetchData();
      toast({
        title: t('dashboard_evaluation:dataset_deleted'),
        status: 'success'
      });
    }
  });

  const handleEdit = (dataset: EvalDatasetSchemaType) => {
    openDatasetModal(dataset);
  };

  const handleDelete = (datasetId: string) => {
    onDeleteDataset(datasetId);
  };

  return (
    <Box>
      {/* Header */}
      <Flex justifyContent="space-between" alignItems="center" mb={4}>
        <Text fontSize="lg" fontWeight="medium">
          {t('dashboard_evaluation:datasets')}
        </Text>
        <Flex gap={2}>
          <SearchInput
            placeholder={t('common:search')}
            value={searchKey}
            onChange={(e) => onSearchChange(e.target.value)}
            maxW="300px"
          />
          <Button
            leftIcon={<MyIcon name="common/addLight" w={4} />}
            onClick={() => openDatasetModal()}
          >
            {t('dashboard_evaluation:create_dataset')}
          </Button>
        </Flex>
      </Flex>

      {/* Table */}
      <TableContainer>
        <Table variant="simple">
          <Thead>
            <Tr>
              <Th>{t('dashboard_evaluation:dataset_name')}</Th>
              <Th>{t('dashboard_evaluation:dataset_description')}</Th>
              <Th>{t('dashboard_evaluation:data_format')}</Th>
              <Th>{t('dashboard_evaluation:columns')}</Th>
              <Th>{t('common:createTime')}</Th>
              <Th>{t('dashboard_evaluation:Action')}</Th>
            </Tr>
          </Thead>
          <Tbody>
            {datasets.map((dataset: EvalDatasetSchemaType) => (
              <Tr key={dataset._id}>
                <Td fontWeight="medium">{dataset.name}</Td>
                <Td color="gray.600" maxW="200px" noOfLines={2}>
                  {dataset.description || '-'}
                </Td>
                <Td>
                  <Text px={2} py={1} bg="gray.100" rounded="md" fontSize="sm" fontWeight="medium">
                    {dataset.dataFormat?.toUpperCase()}
                  </Text>
                </Td>
                <Td>{dataset.columns?.length || 0}</Td>
                <Td color="gray.600" fontSize="sm">
                  {formatTime2YMDHM(dataset.createTime)}
                </Td>
                <Td>
                  <Flex gap={2}>
                    <IconButton
                      aria-label="edit"
                      size="sm"
                      variant="ghost"
                      icon={<MyIcon name="edit" w={4} />}
                      onClick={() => handleEdit(dataset)}
                    />
                    <PopoverConfirm
                      type="delete"
                      Trigger={
                        <IconButton
                          aria-label="delete"
                          size="sm"
                          variant="ghost"
                          colorScheme="red"
                          icon={<MyIcon name="delete" w={4} />}
                        />
                      }
                      content={t('dashboard_evaluation:confirm_delete_dataset')}
                      onConfirm={() => handleDelete(dataset._id)}
                    />
                  </Flex>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </TableContainer>

      {datasets.length === 0 && <EmptyTip text={t('dashboard_evaluation:no_data')} />}

      {total > pageSize && (
        <Flex mt={4} justifyContent="center">
          <Pagination />
        </Flex>
      )}
    </Box>
  );
};

export default DatasetList;
