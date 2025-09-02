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
import UserBox from '@fastgpt/web/components/common/UserBox';
import { useTranslation } from 'next-i18next';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import { getMetricList, deleteMetric } from '@/web/core/evaluation/dimension';
import { EvalMetricTypeEnum } from '@fastgpt/global/core/evaluation/constants';
import type { EvalMetricSchemaType } from '@fastgpt/global/core/evaluation/type';

const EvaluationDimensions = ({ Tab }: { Tab: React.ReactNode }) => {
  const [searchValue, setSearchValue] = useState('');
  const { t } = useTranslation();
  const router = useRouter();

  // 创建适配器函数来匹配 usePagination 的参数格式
  const getMetricListAdapter = async (data: any) => {
    const params = {
      page: data.pageNum,
      pageSize: data.pageSize,
      searchKey: data.searchKey
    };
    const result = await getMetricList(params);

    // 根据实际接口响应结构解析数据
    return {
      list: result.list || [],
      total: result.total || 0
    };
  };

  // 使用分页Hook
  const {
    data: dimensions,
    Pagination,
    getData: fetchData
  } = usePagination(getMetricListAdapter, {
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
    errorToast: t('evaluation_dimension:delete_failed'),
    successToast: t('evaluation_dimension:delete_success')
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
              placeholder={t('evaluation_dimension:search_dimension')}
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
          >
            {t('evaluation_dimension:create_dimension')}
          </Button>
        </HStack>
      </Flex>

      <MyBox flex={'1 0 0'} h={0}>
        <TableContainer h={'100%'} overflowY={'auto'} fontSize={'sm'}>
          <Table>
            <Thead>
              <Tr>
                <Th>{t('evaluation_dimension:dimension_name')}</Th>
                <Th>{t('evaluation_dimension:description')}</Th>
                <Th>{t('evaluation_dimension:create_update_time')}</Th>
                <Th>{t('evaluation_dimension:creator')}</Th>
                <Th></Th>
              </Tr>
            </Thead>
            <Tbody>
              {dimensions.map((dimension: EvalMetricSchemaType) => (
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
                        <MyTag colorSchema="gray">{t('evaluation_dimension:builtin')}</MyTag>
                      )}
                    </HStack>
                  </Td>
                  <Td color={'myGray.600'}>{dimension.description || '-'}</Td>
                  <Td color={'myGray.900'}>
                    <Box>{format(new Date(dimension.createTime), 'yyyy-MM-dd HH:mm:ss')}</Box>
                    <Box>{format(new Date(dimension.updateTime), 'yyyy-MM-dd HH:mm:ss')}</Box>
                  </Td>
                  <Td>
                    <UserBox
                      sourceMember={{
                        // avatar: dimension.creator.avatar,
                        // name: dimension.creator.name,
                        avatar: '/imgs/avatar/BlueAvatar.svg',
                        name: 'System',
                        status: 'active'
                      }}
                      fontSize="sm"
                      spacing={1}
                    />
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
                            t('evaluation_dimension:confirm_delete_dimension')
                          )()
                        }
                      />
                    )}
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

      <ConfirmModal />
    </>
  );
};

export default EvaluationDimensions;
