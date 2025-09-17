import React, { useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import {
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  TableContainer,
  Box,
  Flex,
  HStack,
  Input,
  InputGroup,
  InputLeftElement,
  useDisclosure,
  Text,
  Button
} from '@chakra-ui/react';
import MyBox from '@fastgpt/web/components/common/MyBox';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import MyMenu from '@fastgpt/web/components/common/MyMenu';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { usePagination } from '@fastgpt/web/hooks/usePagination';
import format from 'date-fns/format';
import UserBox from '@fastgpt/web/components/common/UserBox';
import { useEditTitle } from '@/web/common/hooks/useEditTitle';
import { useTranslation } from 'next-i18next';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import IntelligentGeneration from '@/pageComponents/dashboard/evaluation/dataset/IntelligentGeneration';
import ErrorModal from '@/pageComponents/dashboard/evaluation/dataset/errorModal';
import type { listEvalDatasetCollectionResponse } from '@fastgpt/global/core/evaluation/dataset/api';
import {
  getEvaluationDatasetList,
  deleteEvaluationDataset,
  updateEvaluationDataset
} from '@/web/core/evaluation/dataset';

const EvaluationDatasets = ({ Tab }: { Tab: React.ReactNode }) => {
  const [searchValue, setSearchValue] = useState('');
  const [selectedDataset, setSelectedDataset] = useState<listEvalDatasetCollectionResponse | null>(
    null
  );
  const router = useRouter();
  const { t } = useTranslation();
  const {
    isOpen: isErrorModalOpen,
    onOpen: onOpenErrorModal,
    onClose: onCloseErrorModal
  } = useDisclosure();

  const {
    isOpen: isIntelligentModalOpen,
    onOpen: onOpenIntelligentModal,
    onClose: onCloseIntelligentModal
  } = useDisclosure();

  // 使用分页Hook
  const {
    data: datasets,
    Pagination,
    getData: fetchData,
    isLoading,
    total
  } = usePagination(getEvaluationDatasetList, {
    defaultPageSize: 10,
    params: {
      searchKey: searchValue
    },
    EmptyTip: <EmptyTip />,
    refreshDeps: [searchValue]
  });

  // 状态配置
  const statusConfig: Record<listEvalDatasetCollectionResponse['status'], any> = {
    queuing: {
      label: t('dashboard_evaluation:status_queuing'),
      colorSchema: 'gray'
    },
    error: {
      label: t('dashboard_evaluation:generation_error'),
      colorSchema: 'red'
    },
    ready: {
      label: t('dashboard_evaluation:status_ready'),
      colorSchema: 'green'
    },
    processing: {
      label: t('dashboard_evaluation:data_generating'),
      colorSchema: 'primary.600'
    }
  };

  const { openConfirm, ConfirmModal } = useConfirm({
    type: 'delete'
  });

  const { onOpenModal: onOpenEditTitleModal, EditModal: EditTitleModal } = useEditTitle({
    title: t('dashboard_evaluation:rename')
  });

  // 更新数据集名称的请求
  const { runAsync: onUpdateDatasetName } = useRequest2(
    (collectionId: string, name: string) => {
      return updateEvaluationDataset({ collectionId, name });
    },
    {
      successToast: t('common:update_success')
    }
  );

  // 渲染状态标签
  const renderStatus = (dataset: listEvalDatasetCollectionResponse) => {
    const config = statusConfig[dataset.status];

    // 如果状态配置不存在，返回默认状态
    if (!config) {
      return <Text>-</Text>;
    }

    const isErrorStatus = dataset.status === 'error';

    return (
      <MyTooltip
        label={isErrorStatus ? t('dashboard_evaluation:click_to_view_details') : undefined}
        isDisabled={!isErrorStatus}
      >
        <MyTag
          showDot
          colorSchema={config.colorSchema as any}
          type={'fill'}
          cursor={isErrorStatus ? 'pointer' : 'default'}
          onClick={
            isErrorStatus
              ? (e) => {
                  e.stopPropagation();
                  setSelectedDataset(dataset);
                  onOpenErrorModal();
                }
              : undefined
          }
        >
          <Flex fontWeight={'medium'} alignItems={'center'} gap={1}>
            {config.label}
            {isErrorStatus && <MyIcon name={'common/maximize'} w={'11px'} />}
          </Flex>
        </MyTag>
      </MyTooltip>
    );
  };

  const { runAsync: onDelDataset } = useRequest2(deleteEvaluationDataset, {
    successToast: t('common:delete_success'),
    errorToast: t('dashboard_evaluation:delete_dataset_error')
  });

  const handleRenameDataset = (dataset: listEvalDatasetCollectionResponse) => {
    onOpenEditTitleModal({
      defaultVal: dataset.name,
      onSuccess: async (newName) => {
        await onUpdateDatasetName(dataset._id, newName);
        fetchData();
      }
    });
  };

  const handleCreateDataset = (type: 'smart' | 'import') => {
    if (type === 'smart') {
      onOpenIntelligentModal();
    } else {
      // 跳转到文件导入页面
      router.push('/dashboard/evaluation/dataset/fileImport?scene=evaluationDatasetList');
    }
  };

  const handleIntelligentGenerationConfirm = useCallback(() => {
    onCloseIntelligentModal();
    fetchData();
  }, [onCloseIntelligentModal, fetchData]);

  const handleCloseErrorModal = (isUpdateList: boolean) => {
    onCloseErrorModal();
    isUpdateList && fetchData();
  };

  return (
    <>
      <Flex alignItems={'center'}>
        {Tab}
        <Box flex={1} />
        <HStack spacing={4} flexShrink={0}>
          <InputGroup w={'250px'}>
            <InputLeftElement>
              <MyIcon name={'common/searchLight'} w={'16px'} color={'myGray.500'} />
            </InputLeftElement>
            <Input
              placeholder={t('dashboard_evaluation:dataset_name_placeholder')}
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              bg={'white'}
            />
          </InputGroup>
          <MyMenu
            offset={[0, 5]}
            Button={
              <Button leftIcon={<MyIcon name={'common/addLight'} w={4} />}>
                {' '}
                {t('dashboard_evaluation:create_new_dataset')}
              </Button>
            }
            menuList={[
              {
                children: [
                  {
                    label: (
                      <Flex>
                        <MyIcon name={'core/app/aiLightSmall'} w={'20px'} mr={2} />
                        {t('dashboard_evaluation:smart_generation')}
                      </Flex>
                    ),
                    onClick: () => handleCreateDataset('smart')
                  },
                  {
                    label: (
                      <Flex>
                        <MyIcon name={'core/dataset/tableCollection'} mr={2} w={'20px'} />
                        {t('dashboard_evaluation:file_import')}
                      </Flex>
                    ),
                    onClick: () => handleCreateDataset('import')
                  }
                ]
              }
            ]}
          />
        </HStack>
      </Flex>

      <MyBox flex={'1 0 0'} h={0} isLoading={isLoading}>
        <TableContainer h={'100%'} overflowY={'auto'} fontSize={'sm'}>
          <Table>
            <Thead>
              <Tr>
                <Th>{t('dashboard_evaluation:table_header_name')}</Th>
                <Th>{t('dashboard_evaluation:table_header_data_count')}</Th>
                <Th>{t('dashboard_evaluation:table_header_time')}</Th>
                <Th>{t('dashboard_evaluation:table_header_status')}</Th>
                <Th>{t('dashboard_evaluation:table_header_creator')}</Th>
                <Th></Th>
              </Tr>
            </Thead>
            <Tbody>
              {datasets.map((dataset) => (
                <Tr
                  key={dataset._id}
                  cursor={'pointer'}
                  _hover={{ bg: 'myGray.100' }}
                  onClick={() => {
                    router.push({
                      pathname: '/dashboard/evaluation/dataset/detail',
                      query: {
                        collectionId: dataset._id,
                        collectionName: dataset.name
                      }
                    });
                  }}
                >
                  <Td>{dataset.name}</Td>
                  <Td>{dataset.dataItemsCount || 0}</Td>
                  <Td color={'myGray.900'}>
                    <Box>{format(new Date(dataset.createTime), 'yyyy-MM-dd HH:mm:ss')}</Box>
                    <Box>{format(new Date(dataset.updateTime), 'yyyy-MM-dd HH:mm:ss')}</Box>
                  </Td>
                  <Td>{renderStatus(dataset)}</Td>
                  <Td>
                    <UserBox
                      sourceMember={{
                        avatar: dataset.creatorAvatar,
                        name: dataset.creatorName,
                        status: 'active'
                      }}
                      fontSize="sm"
                      spacing={1}
                    />
                  </Td>
                  <Td>
                    <MyMenu
                      menuList={[
                        {
                          label: '',
                          children: [
                            {
                              icon: 'edit',
                              label: t('dashboard_evaluation:rename'),
                              onClick: () => {
                                handleRenameDataset(dataset);
                              }
                            }
                          ]
                        },
                        {
                          children: [
                            {
                              type: 'danger',
                              icon: 'delete',
                              label: t('dashboard_evaluation:delete'),
                              onClick: () =>
                                openConfirm(
                                  async () => {
                                    await onDelDataset({
                                      collectionId: dataset._id
                                    });
                                    fetchData();
                                  },
                                  undefined,
                                  t('dashboard_evaluation:confirm_delete_dataset')
                                )()
                            }
                          ]
                        }
                      ]}
                      Button={<MyIconButton icon={'more'} />}
                    />
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
          {total === 0 && <EmptyTip text={t('dashboard_evaluation:no_data')} pt={'30vh'} />}
        </TableContainer>
      </MyBox>

      <Flex mt={4} justifyContent="center">
        <Pagination />
      </Flex>

      {/* 异常详情弹窗 */}
      {selectedDataset && (
        <ErrorModal
          isOpen={isErrorModalOpen}
          onClose={handleCloseErrorModal}
          collectionId={selectedDataset._id}
        />
      )}

      <ConfirmModal confirmText={t('common:Delete')} />
      <EditTitleModal closeBtnText={t('common:Cancel')} />

      {/* 智能生成数据集弹窗 */}
      {isIntelligentModalOpen && (
        <IntelligentGeneration
          isOpen={isIntelligentModalOpen}
          onClose={onCloseIntelligentModal}
          onConfirm={handleIntelligentGenerationConfirm}
        />
      )}
    </>
  );
};

export default EvaluationDatasets;
