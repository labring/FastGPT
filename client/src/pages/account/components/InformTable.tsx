import React from 'react';
import { Box, Flex, useTheme } from '@chakra-ui/react';
import { getInforms, readInform } from '@/api/user';
import { usePagination } from '@/hooks/usePagination';
import { useLoading } from '@/hooks/useLoading';
import type { informSchema } from '@/types/mongoSchema';
import { formatTimeToChatTime } from '@/utils/tools';
import { useGlobalStore } from '@/store/global';
import MyIcon from '@/components/Icon';

const BillTable = () => {
  const theme = useTheme();
  const { Loading } = useLoading();
  const { isPc } = useGlobalStore();
  const {
    data: informs,
    isLoading,
    total,
    pageSize,
    Pagination,
    getData,
    pageNum
  } = usePagination<informSchema>({
    api: getInforms,
    pageSize: isPc ? 20 : 10
  });

  return (
    <Flex flexDirection={'column'} py={[0, 5]} h={'100%'} position={'relative'}>
      <Box px={[3, 8]} position={'relative'} flex={'1 0 0'} h={0} overflowY={'auto'}>
        {informs.map((item) => (
          <Box
            key={item._id}
            border={theme.borders.md}
            py={2}
            px={4}
            borderRadius={'md'}
            cursor={item.read ? 'default' : 'pointer'}
            position={'relative'}
            _notLast={{ mb: 3 }}
            onClick={async () => {
              if (!item.read) {
                await readInform(item._id);
                getData(pageNum);
              }
            }}
          >
            <Flex alignItems={'center'} justifyContent={'space-between'}>
              <Box>{item.title}</Box>
              <Box ml={2} color={'myGray.500'}>
                {formatTimeToChatTime(item.time)}
              </Box>
            </Flex>
            <Box fontSize={'sm'} color={'myGray.600'}>
              {item.content}
            </Box>
            {!item.read && (
              <Box
                w={'5px'}
                h={'5px'}
                borderRadius={'10px'}
                bg={'myRead.600'}
                position={'absolute'}
                bottom={'8px'}
                right={'8px'}
              ></Box>
            )}
          </Box>
        ))}
      </Box>
      {!isLoading && informs.length === 0 && (
        <Flex flex={'1 0 0'} flexDirection={'column'} alignItems={'center'} pt={'-48px'}>
          <MyIcon name="empty" w={'48px'} h={'48px'} color={'transparent'} />
          <Box mt={2} color={'myGray.500'}>
            暂无通知~
          </Box>
        </Flex>
      )}
      {total > pageSize && (
        <Flex w={'100%'} mt={4} px={[3, 8]} justifyContent={'flex-end'}>
          <Pagination />
        </Flex>
      )}
      <Loading loading={isLoading && informs.length === 0} fixed={false} />
    </Flex>
  );
};

export default BillTable;
