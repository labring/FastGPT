import React, { useEffect, useCallback, useState } from 'react';
import {
  Box,
  TableContainer,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  IconButton,
  Flex,
  Button
} from '@chakra-ui/react';
import type { ModelSchema } from '@/types/mongoSchema';
import { ModelDataSchema } from '@/types/mongoSchema';
import { ModelDataStatusMap } from '@/constants/model';
import { usePaging } from '@/hooks/usePaging';
import ScrollData from '@/components/ScrollData';
import { getModelDataList } from '@/api/model';
import { DeleteIcon } from '@chakra-ui/icons';

const ModelDataCard = ({ model }: { model: ModelSchema }) => {
  const {
    nextPage,
    isLoadAll,
    requesting,
    data: dataList,
    total
  } = usePaging<ModelDataSchema>({
    api: getModelDataList,
    pageSize: 10,
    params: {
      modelId: model._id
    }
  });

  return (
    <>
      <Flex>
        <Box fontWeight={'bold'} fontSize={'lg'} flex={1}>
          模型数据: {total}组
        </Box>
        <Button size={'sm'}>导入</Button>
      </Flex>
      <ScrollData
        flex={'1 0 0'}
        h={0}
        px={6}
        mt={3}
        isLoadAll={isLoadAll}
        requesting={requesting}
        nextPage={nextPage}
        fontSize={'xs'}
        whiteSpace={'pre-wrap'}
      >
        <TableContainer mt={4}>
          <Table variant={'simple'}>
            <Thead>
              <Tr>
                <Th>Question</Th>
                <Th>Text</Th>
                <Th>Status</Th>
                <Th></Th>
              </Tr>
            </Thead>
            <Tbody>
              {dataList.map((item) => (
                <Tr key={item._id}>
                  <Td>{item.q}</Td>
                  <Td>{item.a}</Td>
                  <Td>{ModelDataStatusMap[item.status]}</Td>
                  <Td>
                    <IconButton icon={<DeleteIcon />} aria-label={'delete'} />
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </TableContainer>
      </ScrollData>
    </>
  );
};

export default ModelDataCard;
