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
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  useDisclosure,
  Text
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

// 数据集状态类型
type DatasetStatus =
  | 'queuing'
  | 'parsing'
  | 'generating'
  | 'generateError'
  | 'ready'
  | 'parseError';

// 数据集类型
interface EvaluationDataset {
  id: number;
  name: string;
  dataCount: number;
  status: DatasetStatus;
  createTime: Date | string;
  updateTime: Date | string;
  creator: {
    name: string;
    avatar: string;
  };
  errorMessage?: string; // 异常状态时的错误信息
}

// 模拟数据
const mockDatasets: EvaluationDataset[] = [
  {
    id: 1,
    name: '数据集1',
    dataCount: 100,
    status: 'queuing',
    createTime: '2025-05-23T10:36:13.000Z',
    updateTime: '2025-05-23T10:56:13.000Z',
    creator: {
      name: 'violetjam',
      avatar: '/imgs/avatar/BlueAvatar.svg'
    }
  },
  {
    id: 2,
    name: '数据集2',
    dataCount: 100,
    status: 'parsing',
    createTime: '2025-05-23T10:36:13.000Z',
    updateTime: '2025-05-23T10:56:13.000Z',
    creator: {
      name: 'violetjam',
      avatar: '/imgs/avatar/BlueAvatar.svg'
    }
  },
  {
    id: 3,
    name: '数据集3',
    dataCount: 100,
    status: 'generating',
    createTime: '2025-05-23T10:36:13.000Z',
    updateTime: '2025-05-23T10:56:13.000Z',
    creator: {
      name: 'violetjam',
      avatar: '/imgs/avatar/BlueAvatar.svg'
    }
  },
  {
    id: 4,
    name: '数据集4',
    dataCount: 100,
    status: 'generateError',
    createTime: '2025-05-23T10:36:13.000Z',
    updateTime: '2025-05-23T10:56:13.000Z',
    creator: {
      name: 'violetjam',
      avatar: '/imgs/avatar/BlueAvatar.svg'
    },
    errorMessage: '数据生成失败：模型调用异常'
  },
  {
    id: 5,
    name: '数据集5',
    dataCount: 100,
    status: 'ready',
    createTime: '2025-05-23T10:36:13.000Z',
    updateTime: '2025-05-23T10:56:13.000Z',
    creator: {
      name: 'violetjam',
      avatar: '/imgs/avatar/BlueAvatar.svg'
    }
  },
  {
    id: 6,
    name: '数据集6',
    dataCount: 0,
    status: 'parseError',
    createTime: '2025-05-23T10:36:13.000Z',
    updateTime: '2025-05-23T10:56:13.000Z',
    creator: {
      name: 'violetjam',
      avatar: '/imgs/avatar/BlueAvatar.svg'
    },
    errorMessage: '文件解析失败：格式不支持或文件损坏'
  }
];

// 模拟API函数
const getMockEvaluationDatasets = async (data: any) => {
  await new Promise((resolve) => setTimeout(resolve, 300));

  const { pageNum, pageSize, searchKey = '' } = data;

  // 过滤数据
  let filteredDatasets = mockDatasets.filter((dataset) => {
    const matchesSearch = dataset.name.toLowerCase().includes(searchKey.toLowerCase());
    return matchesSearch;
  });

  // 分页
  const total = filteredDatasets.length;
  const startIndex = (pageNum - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const list = filteredDatasets.slice(startIndex, endIndex);

  return {
    list,
    total
  };
};

const EvaluationDatasets = ({ Tab }: { Tab: React.ReactNode }) => {
  const [searchValue, setSearchValue] = useState('');
  const [selectedError, setSelectedError] = useState<string>('');
  const router = useRouter();
  const { t } = useTranslation();
  const {
    isOpen: isErrorModalOpen,
    onOpen: onOpenErrorModal,
    onClose: onCloseErrorModal
  } = useDisclosure();
  const {
    isOpen: isCreateModalOpen,
    onOpen: onOpenCreateModal,
    onClose: onCloseCreateModal
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
    getData: fetchData
  } = usePagination(getMockEvaluationDatasets, {
    defaultPageSize: 10,
    params: {
      searchKey: searchValue
    },
    EmptyTip: <EmptyTip />,
    refreshDeps: [searchValue]
  });

  // 状态配置
  const statusConfig = {
    queuing: {
      label: t('dashboard_evaluation:status_queuing'),
      colorSchema: 'gray'
    },
    parsing: {
      label: t('dashboard_evaluation:status_parsing'),
      colorSchema: 'blue'
    },
    generating: {
      label: t('dashboard_evaluation:status_generating'),
      colorSchema: 'blue'
    },
    generateError: {
      label: t('dashboard_evaluation:status_generate_error'),
      colorSchema: 'red'
    },
    ready: {
      label: t('dashboard_evaluation:status_ready'),
      colorSchema: 'green'
    },
    parseError: {
      label: t('dashboard_evaluation:status_parse_error'),
      colorSchema: 'red'
    }
  };

  const { openConfirm, ConfirmModal } = useConfirm({
    type: 'delete'
  });

  const { onOpenModal: onOpenEditTitleModal, EditModal: EditTitleModal } = useEditTitle({
    title: t('dashboard_evaluation:rename')
  });

  // 模拟更新数据集名称的请求
  const { runAsync: onUpdateDatasetName, loading: isUpdating } = useRequest2(
    (datasetId: number, newName: string) => {
      console.log('updateDatasetName', datasetId, newName);
      return Promise.resolve();
    },
    {
      successToast: '更新成功'
    }
  );

  // 渲染状态标签
  const renderStatus = (dataset: EvaluationDataset) => {
    const config = statusConfig[dataset.status];

    // 如果状态配置不存在，返回默认状态
    if (!config) {
      return <Text>-</Text>;
    }

    const isErrorStatus = dataset.status === 'generateError' || dataset.status === 'parseError';

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
                  setSelectedError(dataset.errorMessage || 'unknown error');
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

  const handleDeleteDataset = (datasetId: number) => {
    console.log('deleteDataset:', datasetId);
  };

  const handleRenameDataset = (dataset: EvaluationDataset) => {
    onOpenEditTitleModal({
      defaultVal: dataset.name,
      onSuccess: async (newName) => {
        await onUpdateDatasetName(dataset.id, newName);
        fetchData();
      }
    });
  };

  const handleCreateDataset = (type: 'smart' | 'import') => {
    console.log('createDataset:', type);
    onCloseCreateModal();

    if (type === 'smart') {
      onOpenIntelligentModal();
    } else {
      // 跳转到文件导入页面
      router.push('/dashboard/evaluation/dataset/fileImport');
    }
  };

  const handleIntelligentGenerationConfirm = useCallback(
    (data: any) => {
      console.log('generateDataset:', data);
      onCloseIntelligentModal();
      // 这里应该调用API创建数据集
    },
    [onCloseIntelligentModal]
  );

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
              <Flex
                px={3.5}
                py={2}
                borderRadius={'sm'}
                cursor={'pointer'}
                bg={'primary.500'}
                overflow={'hidden'}
                color={'white'}
                _hover={{
                  bg: 'primary.600'
                }}
              >
                <Box h={'20px'} fontSize={'sm'} fontWeight={'500'}>
                  {t('dashboard_evaluation:create_new_dataset')}
                </Box>
              </Flex>
            }
            menuList={[
              {
                children: [
                  {
                    label: (
                      <Flex>
                        <MyIcon name={'core/app/simpleMode/ai'} w={'20px'} mr={2} />
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

      <MyBox flex={'1 0 0'} h={0}>
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
                <Tr key={dataset.id} _hover={{ bg: 'myGray.100' }}>
                  <Td>{dataset.name}</Td>
                  <Td>{dataset.dataCount}</Td>
                  <Td color={'myGray.900'}>
                    <Box>{format(new Date(dataset.createTime), 'yyyy-MM-dd HH:mm:ss')}</Box>
                    <Box>{format(new Date(dataset.updateTime), 'yyyy-MM-dd HH:mm:ss')}</Box>
                  </Td>
                  <Td>{renderStatus(dataset)}</Td>
                  <Td>
                    <UserBox
                      sourceMember={{
                        avatar: dataset.creator.avatar,
                        name: dataset.creator.name,
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
                              onClick: () => handleRenameDataset(dataset)
                            },
                            {
                              type: 'danger',
                              icon: 'delete',
                              label: t('dashboard_evaluation:delete'),
                              onClick: () =>
                                openConfirm(
                                  async () => {
                                    await handleDeleteDataset(dataset.id);
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
        </TableContainer>
      </MyBox>

      <Flex mt={4} justifyContent="center">
        <Pagination />
      </Flex>

      {/* 异常详情弹窗 */}
      <Modal isOpen={isErrorModalOpen} onClose={onCloseErrorModal}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>{t('dashboard_evaluation:error_details')}</ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={6}>
            <Text color="red.600">{selectedError}</Text>
          </ModalBody>
        </ModalContent>
      </Modal>

      <ConfirmModal />
      <EditTitleModal />

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
