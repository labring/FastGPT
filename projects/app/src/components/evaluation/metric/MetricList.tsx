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
  Text,
  Badge,
  HStack
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
import { getMetricList, deleteMetric, testMetric } from '@/web/core/evaluation/metric';
import type { EvaluationMetricSchemaType } from '@fastgpt/global/core/evaluation/type';
import { useToast } from '@fastgpt/web/hooks/useToast';

interface MetricListProps {
  searchKey: string;
  onSearchChange: (value: string) => void;
}

const getMetricTypeColor = (type: string) => {
  switch (type) {
    case 'ai_model':
      return 'blue';
    default:
      return 'gray';
  }
};

const getMetricTypeName = (type: string, t: any) => {
  switch (type) {
    case 'ai_model':
      return t('dashboard_evaluation:ai_model_metric');
    default:
      return type;
  }
};

const MetricList: React.FC<MetricListProps> = ({ searchKey, onSearchChange }) => {
  const { t } = useTranslation();
  const { toast } = useToast();

  const { metrics, setMetrics, removeMetric, openMetricModal } = useEvaluationStore();

  const {
    data: metricList,
    Pagination,
    getData: fetchData,
    total,
    pageSize
  } = usePagination<any, EvaluationMetricSchemaType>(
    (params) =>
      getMetricList({
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
    if (metricList) {
      setMetrics(metricList);
    }
  }, [metricList, setMetrics]);

  const { runAsync: onDeleteMetric } = useRequest2(deleteMetric, {
    onSuccess: (_, [metricId]) => {
      removeMetric(metricId);
      fetchData();
      toast({
        title: t('dashboard_evaluation:metric_deleted'),
        status: 'success'
      });
    }
  });

  const { runAsync: onTestMetric, loading: isTestingMetric } = useRequest2(testMetric, {
    onSuccess: () => {
      toast({
        title: t('common:test_success'),
        status: 'success'
      });
    }
  });

  const handleEdit = (metric: EvaluationMetricSchemaType) => {
    openMetricModal(metric);
  };

  const handleDelete = (metricId: string) => {
    onDeleteMetric(metricId);
  };

  const handleTest = (metricId: string) => {
    onTestMetric({
      metricId,
      testCase: {
        userInput: 'test question',
        expectedOutput: 'expected answer',
        actualOutput: 'actual response'
      }
    });
  };

  return (
    <Box>
      {/* Header */}
      <Flex justifyContent="space-between" alignItems="center" mb={4}>
        <Text fontSize="lg" fontWeight="medium">
          {t('dashboard_evaluation:metrics')}
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
            onClick={() => openMetricModal()}
          >
            {t('dashboard_evaluation:create_metric')}
          </Button>
        </Flex>
      </Flex>

      {/* Table */}
      <TableContainer>
        <Table variant="simple">
          <Thead>
            <Tr>
              <Th>{t('dashboard_evaluation:metric_name')}</Th>
              <Th>{t('dashboard_evaluation:metric_type')}</Th>
              <Th>{t('common:description')}</Th>
              <Th>{t('common:createTime')}</Th>
              <Th>{t('dashboard_evaluation:Action')}</Th>
            </Tr>
          </Thead>
          <Tbody>
            {metrics.map((metric: EvaluationMetricSchemaType) => (
              <Tr key={metric._id}>
                <Td fontWeight="medium">{metric.name}</Td>
                <Td>
                  <Badge colorScheme={getMetricTypeColor(metric.type)} variant="subtle">
                    {getMetricTypeName(metric.type, t)}
                  </Badge>
                </Td>
                <Td color="gray.600" maxW="200px" noOfLines={2}>
                  {metric.description || '-'}
                </Td>
                <Td color="gray.600" fontSize="sm">
                  {formatTime2YMDHM(metric.createTime)}
                </Td>
                <Td>
                  <HStack spacing={2}>
                    <IconButton
                      aria-label="test"
                      size="sm"
                      variant="ghost"
                      colorScheme="blue"
                      icon={<MyIcon name="common/playFill" w={4} />}
                      onClick={() => handleTest(metric._id)}
                      isLoading={isTestingMetric}
                    />
                    <IconButton
                      aria-label="edit"
                      size="sm"
                      variant="ghost"
                      icon={<MyIcon name="edit" w={4} />}
                      onClick={() => handleEdit(metric)}
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
                      content={t('dashboard_evaluation:confirm_delete_metric')}
                      onConfirm={() => handleDelete(metric._id)}
                    />
                  </HStack>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </TableContainer>

      {metrics.length === 0 && <EmptyTip text={t('dashboard_evaluation:no_data')} />}

      {total > pageSize && (
        <Flex mt={4} justifyContent="center">
          <Pagination />
        </Flex>
      )}
    </Box>
  );
};

export default MetricList;
