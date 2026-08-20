import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Button,
  Flex,
  Progress,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr
} from '@chakra-ui/react';
import dayjs from 'dayjs';
import { useTranslation } from 'next-i18next';
import { useContextSelector } from 'use-context-selector';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyInput from '@/components/MyInput';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { getWebReqUrl } from '@fastgpt/web/common/system/utils';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import {
  cancelDatasetSynonymJob,
  deleteDatasetSynonym,
  getDatasetSynonymDetail,
  retryDatasetSynonymJob,
  searchDatasetSynonymMappings,
  updateDatasetSynonymFile,
  uploadDatasetSynonymFile
} from '@/web/core/dataset/api/synonym';
import { DatasetSynonymJobStatusEnum } from '@fastgpt/global/core/dataset/synonym';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { formatFileSize } from '@fastgpt/global/common/file/tools';

const activeStatuses = new Set<DatasetSynonymJobStatusEnum>([
  DatasetSynonymJobStatusEnum.pending,
  DatasetSynonymJobStatusEnum.diffing,
  DatasetSynonymJobStatusEnum.marking,
  DatasetSynonymJobStatusEnum.processing,
  DatasetSynonymJobStatusEnum.rollingBack
]);
const cancellableStatuses = new Set<DatasetSynonymJobStatusEnum>([
  DatasetSynonymJobStatusEnum.pending,
  DatasetSynonymJobStatusEnum.diffing,
  DatasetSynonymJobStatusEnum.marking
]);

const downloadSynonymTemplate = () => {
  const content = '\uFEFF标准术语,同义词,,\n退款,退货,退单,退钱\n订单,订单号,交易,购买订单\n';
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'synonym-template.csv';
  link.click();
  URL.revokeObjectURL(url);
};

const Synonym = ({ datasetId }: { datasetId: string }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const datasetDetail = useContextSelector(DatasetPageContext, (v) => v.datasetDetail);
  const canWrite = datasetDetail.permission.hasWritePer;
  const [search, setSearch] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);

  const {
    data: detail,
    runAsync: refreshDetail,
    loading: detailLoading
  } = useRequest(() => getDatasetSynonymDetail(datasetId), {
    manual: false,
    refreshDeps: [datasetId]
  });
  const currentJob = detail?.currentJob;
  const isProcessing = !!currentJob && activeStatuses.has(currentJob.status);

  useEffect(() => {
    if (!isProcessing) return;
    const timer = window.setInterval(() => refreshDetail(), 3000);
    return () => window.clearInterval(timer);
  }, [isProcessing, refreshDetail]);

  const { data: mappingData, runAsync: refreshMappings } = useRequest(
    () => searchDatasetSynonymMappings({ datasetId, search, pageNum: 1, pageSize: 100 }),
    {
      manual: false,
      debounceWait: 300,
      refreshDeps: [datasetId, search, detail?.file?.activeVersion]
    }
  );

  const { runAsync: submitFile, loading: uploadLoading } = useRequest(
    async (file: File) => {
      if (!/\.(csv|xls|xlsx)$/i.test(file.name)) {
        throw new Error(t('dataset:synonym.invalid_file'));
      }
      if (file.size > 10 * 1024 * 1024) throw new Error(t('dataset:synonym.file_too_large'));
      return detail?.file
        ? updateDatasetSynonymFile({
            datasetId,
            oldSynonymId: detail.file._id,
            file,
            onProgress: setUploadProgress
          })
        : uploadDatasetSynonymFile({ datasetId, file, onProgress: setUploadProgress });
    },
    {
      onSuccess: async () => {
        setUploadProgress(0);
        await refreshDetail();
        await refreshMappings();
        toast({ status: 'success', title: t('dataset:synonym.job_created') });
      },
      onError: (error) => {
        setUploadProgress(0);
        toast({ status: 'error', title: getErrText(error) });
      }
    }
  );

  const { runAsync: removeFile, loading: deleteLoading } = useRequest(
    async () => {
      if (!detail?.file) return;
      await deleteDatasetSynonym(detail.file._id);
      await refreshDetail();
    },
    { errorToast: t('common:delete_failed') }
  );
  const { openConfirm, ConfirmModal } = useConfirm({
    type: 'delete',
    title: t('dataset:synonym.delete_title'),
    content: t('dataset:synonym.delete_tip')
  });
  const { runAsync: runJobAction, loading: jobActionLoading } = useRequest(
    async (action: 'retry' | 'cancel') => {
      if (!currentJob) return;
      if (action === 'retry') await retryDatasetSynonymJob(currentJob._id);
      else await cancelDatasetSynonymJob(currentJob._id);
      await refreshDetail();
    },
    {
      onSuccess: (_, [action]) => {
        toast({
          status: 'success',
          title: t(
            action === 'retry' ? 'dataset:synonym.retry_success' : 'dataset:synonym.cancel_success'
          )
        });
      },
      onError: (error) => toast({ status: 'error', title: getErrText(error) })
    }
  );

  const progress = useMemo(() => {
    const summary = currentJob?.diffSummary;
    if (!summary?.affectedDataCount) return currentJob?.status === 'completed' ? 100 : 0;
    return Math.min(
      100,
      Math.round((summary.completedDataCount / summary.affectedDataCount) * 100)
    );
  }, [currentJob]);

  return (
    <MyBox isLoading={detailLoading} h={'100%'} overflow={'auto'} px={[4, 7]} py={5}>
      <Flex align={'center'} justify={'space-between'} gap={4} wrap={'wrap'}>
        <Box>
          <Text fontSize={'lg'} fontWeight={600}>
            {t('dataset:synonym.title')}
          </Text>
          <Text mt={1} fontSize={'sm'} color={'myGray.500'}>
            {t('dataset:synonym.billing_tip')}
          </Text>
        </Box>
        <Flex gap={2}>
          <Button
            size={'sm'}
            variant={'whiteBase'}
            leftIcon={<MyIcon name={'common/download'} w={'16px'} />}
            onClick={downloadSynonymTemplate}
          >
            {t('dataset:synonym.download_template')}
          </Button>
          {canWrite && currentJob?.status === DatasetSynonymJobStatusEnum.failed && (
            <Button
              size={'sm'}
              variant={'whiteBase'}
              leftIcon={<MyIcon name={'common/refresh'} w={'16px'} />}
              isLoading={jobActionLoading}
              onClick={() => void runJobAction('retry')}
            >
              {t('dataset:synonym.retry_job')}
            </Button>
          )}
          {canWrite && currentJob && cancellableStatuses.has(currentJob.status) && (
            <Button
              size={'sm'}
              variant={'whiteBase'}
              leftIcon={<MyIcon name={'common/closeLight'} w={'16px'} />}
              isLoading={jobActionLoading}
              onClick={() => void runJobAction('cancel')}
            >
              {t('dataset:synonym.cancel_job')}
            </Button>
          )}
          {detail?.file && (
            <Button
              size={'sm'}
              variant={'whiteBase'}
              leftIcon={<MyIcon name={'common/download'} w={'16px'} />}
              onClick={() =>
                window.open(
                  getWebReqUrl(`/api/core/dataset/synonym/download?id=${detail.file!._id}`),
                  '_blank'
                )
              }
            >
              {t('common:Download')}
            </Button>
          )}
          {canWrite && (
            <>
              <input
                ref={fileInputRef}
                hidden
                type={'file'}
                accept={'.csv,.xls,.xlsx'}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (file) void submitFile(file);
                }}
              />
              <Button
                size={'sm'}
                leftIcon={<MyIcon name={'upload'} w={'16px'} />}
                isLoading={uploadLoading}
                isDisabled={isProcessing}
                onClick={() => fileInputRef.current?.click()}
              >
                {detail?.file
                  ? t('dataset:synonym.replace_file')
                  : t('dataset:synonym.upload_file')}
              </Button>
              {detail?.file && (
                <Button
                  size={'sm'}
                  variant={'whiteDanger'}
                  leftIcon={<MyIcon name={'delete'} w={'16px'} />}
                  isDisabled={isProcessing}
                  isLoading={deleteLoading}
                  onClick={() => openConfirm({ onConfirm: removeFile })()}
                >
                  {t('common:Delete')}
                </Button>
              )}
            </>
          )}
        </Flex>
      </Flex>

      {uploadLoading && uploadProgress > 0 && (
        <Progress mt={4} value={uploadProgress} size={'sm'} />
      )}

      <Flex mt={5} py={4} borderY={'1px solid'} borderColor={'myGray.200'} gap={8} wrap={'wrap'}>
        <Box minW={'180px'}>
          <Text fontSize={'xs'} color={'myGray.500'}>
            {t('dataset:synonym.current_file')}
          </Text>
          <Text mt={1} fontSize={'sm'} fontWeight={500}>
            {detail?.file?.fileName ?? '-'}
          </Text>
          {detail?.file && (
            <Text fontSize={'xs'} color={'myGray.500'}>
              {formatFileSize(detail.file.size ?? 0)} ·{' '}
              {dayjs(detail.file.uploadTime).format('YYYY-MM-DD HH:mm')}
            </Text>
          )}
        </Box>
        <Box minW={'180px'}>
          <Text fontSize={'xs'} color={'myGray.500'}>
            {t('dataset:synonym.job_status')}
          </Text>
          <Text
            mt={1}
            fontSize={'sm'}
            fontWeight={500}
            color={currentJob?.status === 'failed' ? 'red.600' : 'myGray.900'}
          >
            {currentJob ? String(t(`dataset:synonym.status_${currentJob.status}` as any)) : '-'}
          </Text>
          {currentJob?.errorMsg && (
            <Text fontSize={'xs'} color={'red.600'}>
              {currentJob.errorMsg}
            </Text>
          )}
        </Box>
        {currentJob?.diffSummary && (
          <Box flex={1} minW={'260px'}>
            <Text fontSize={'xs'} color={'myGray.500'}>
              {t('dataset:synonym.diff_summary')}
            </Text>
            <Text mt={1} fontSize={'sm'}>
              {String(t('dataset:synonym.diff_values', currentJob.diffSummary as any))}
            </Text>
            {isProcessing && <Progress mt={2} value={progress} size={'sm'} borderRadius={'sm'} />}
          </Box>
        )}
      </Flex>

      <Flex mt={5} align={'center'} justify={'space-between'} gap={3}>
        <Text fontWeight={600}>{t('dataset:synonym.mapping_list')}</Text>
        <MyInput
          w={['100%', '280px']}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t('dataset:synonym.search_placeholder')}
          leftIcon={<MyIcon name={'common/searchLight'} w={'16px'} />}
        />
      </Flex>
      <Box
        mt={3}
        border={'1px solid'}
        borderColor={'myGray.200'}
        borderRadius={'md'}
        overflowX={'auto'}
      >
        <Table size={'sm'}>
          <Thead bg={'myGray.50'}>
            <Tr>
              <Th>{t('dataset:synonym.standard_term')}</Th>
              <Th>{t('dataset:synonym.synonym_terms')}</Th>
            </Tr>
          </Thead>
          <Tbody>
            {(mappingData?.list ?? []).map((mapping) => (
              <Tr key={mapping._id}>
                <Td fontWeight={500}>{mapping.standardizedTerm}</Td>
                <Td color={'myGray.600'}>{mapping.synonymTerms.join('、')}</Td>
              </Tr>
            ))}
            {(mappingData?.list?.length ?? 0) === 0 && (
              <Tr>
                <Td colSpan={2} py={10} textAlign={'center'} color={'myGray.500'}>
                  {t('dataset:synonym.empty')}
                </Td>
              </Tr>
            )}
          </Tbody>
        </Table>
      </Box>
      <ConfirmModal />
    </MyBox>
  );
};

export default Synonym;
