import React, { useState } from 'react';
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
  Button,
  HStack,
  Text,
  Input,
  InputGroup,
  InputLeftElement
} from '@chakra-ui/react';
import MyBox from '@fastgpt/web/components/common/MyBox';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTag from '@fastgpt/web/components/common/Tag';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useRouter } from 'next/router';
import { usePagination } from '@fastgpt/web/hooks/usePagination';
import format from 'date-fns/format';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { useTranslation } from 'next-i18next';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import { getMetricList, deleteMetric } from '@/web/core/evaluation/dimension';
import { EvalMetricTypeEnum } from '@fastgpt/global/core/evaluation/metric/constants';
import type { EvalMetricDisplayType } from '@fastgpt/global/core/evaluation/metric/type';
import type { PaginationProps, PaginationResponse } from '@fastgpt/web/common/fetch/type';

const EvaluationDimensions = ({ Tab }: { Tab: React.ReactNode }) => {
  const [searchValue, setSearchValue] = useState('');
  const { t } = useTranslation();
  const router = useRouter();

  const getMetricListAdapter = async (
    data: PaginationProps<{ searchKey: string }>
  ): Promise<PaginationResponse<EvalMetricDisplayType>> => {
    return getMetricList({
      pageNum: Number(data.pageNum),
      pageSize: Number(data.pageSize),
      searchKey: data.searchKey
    });
  };

  const {
    data: dimensions,
    Pagination,
    getData: fetchData,
    isLoading,
    total
  } = usePagination<{ searchKey: string }, EvalMetricDisplayType>(getMetricListAdapter, {
    defaultPageSize: 10,
    params: {
      searchKey: searchValue
    },
    EmptyTip: <EmptyTip />,
    refreshDeps: [searchValue]
  });

  const { openConfirm, ConfirmModal } = useConfirm({
    type: 'delete'
  });

  const { runAsync: onDeleteMetric } = useRequest2(deleteMetric, {
    onSuccess: () => {
      fetchData();
    },
    errorToast: t('dashboard_evaluation:delete_failed'),
    successToast: t('dashboard_evaluation:delete_success')
  });

  const handleDeleteDimension = (dimensionId: string) => {
    onDeleteMetric(dimensionId);
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
              placeholder={t('dashboard_evaluation:search_dimension')}
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              bg={'white'}
            />
          </InputGroup>
          <Button
            onClick={() => {
              router.push('/dashboard/evaluation/dimension/create');
            }}
            h={9}
            px={4}
            flexShrink={0}
            leftIcon={<MyIcon name={'common/addLight'} w={4} />}
          >
            {t('dashboard_evaluation:create_dimension')}
          </Button>
        </HStack>
      </Flex>

      <MyBox flex={'1 0 0'} h={0} isLoading={isLoading}>
        <TableContainer h={'100%'} overflowY={'auto'} fontSize={'sm'}>
          <Table>
            <Thead>
              <Tr>
                <Th>{t('dashboard_evaluation:dimension_name')}</Th>
                <Th>{t('dashboard_evaluation:description')}</Th>
                <Th>{t('dashboard_evaluation:create_update_time')}</Th>
                <Th>{t('dashboard_evaluation:creator')}</Th>
                <Th></Th>
              </Tr>
            </Thead>
            <Tbody>
              {dimensions.map((dimension) => (
                <Tr
                  key={dimension._id}
                  _hover={{ bg: 'myGray.100' }}
                  cursor={dimension.type === EvalMetricTypeEnum.Custom ? 'pointer' : 'default'}
                  onClick={
                    dimension.type === EvalMetricTypeEnum.Custom
                      ? () => {
                          router.push({
                            pathname: '/dashboard/evaluation/dimension/edit',
                            query: { id: dimension._id }
                          });
                        }
                      : undefined
                  }
                >
                  <Td>
                    <HStack spacing={2}>
                      <Text>{dimension.name}</Text>
                      {dimension.type === EvalMetricTypeEnum.Builtin && (
                        <MyTag colorSchema="gray">{t('dashboard_evaluation:builtin')}</MyTag>
                      )}
                    </HStack>
                  </Td>
                  <Td>{dimension.description || '-'}</Td>
                  <Td>
                    <Box>{format(new Date(dimension.createTime), 'yyyy-MM-dd HH:mm:ss')}</Box>
                    <Box>{format(new Date(dimension.updateTime), 'yyyy-MM-dd HH:mm:ss')}</Box>
                  </Td>
                  <Td>
                    <Flex alignItems={'center'} gap={1.5}>
                      <Avatar
                        src={dimension.sourceMember?.avatar}
                        w={5}
                        borderRadius={'full'}
                        border={'1px solid'}
                        borderColor={'myGray.200'}
                      />
                      <Box>{dimension.sourceMember?.name}</Box>
                    </Flex>
                  </Td>
                  <Td onClick={(e) => e.stopPropagation()}>
                    {dimension.type === EvalMetricTypeEnum.Custom && (
                      <MyIconButton
                        icon="delete"
                        w={'24px'}
                        h={'24px'}
                        hoverBg="red.50"
                        hoverColor={'red.600'}
                        onClick={() =>
                          openConfirm(
                            async () => {
                              await handleDeleteDimension(dimension._id);
                            },
                            undefined,
                            t('dashboard_evaluation:confirm_delete_dimension')
                          )()
                        }
                      />
                    )}
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

      <ConfirmModal />
    </>
  );
};

export default EvaluationDimensions;
