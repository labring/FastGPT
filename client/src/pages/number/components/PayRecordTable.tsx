import React, { useState, useCallback } from 'react';
import {
  Button,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  TableContainer,
  Flex,
  Box
} from '@chakra-ui/react';
import { getPayOrders, checkPayResult } from '@/api/user';
import { PaySchema } from '@/types/mongoSchema';
import dayjs from 'dayjs';
import { useQuery } from '@tanstack/react-query';
import { formatPrice } from '@/utils/user';
import { useGlobalStore } from '@/store/global';
import { useToast } from '@/hooks/useToast';
import { useLoading } from '@/hooks/useLoading';
import MyIcon from '@/components/Icon';

const PayRecordTable = () => {
  const { Loading, setIsLoading } = useLoading();
  const [payOrders, setPayOrders] = useState<PaySchema[]>([]);
  const { toast } = useToast();

  const handleRefreshPayOrder = useCallback(
    async (payId: string) => {
      setIsLoading(true);

      try {
        const data = await checkPayResult(payId);
        toast({
          title: data,
          status: 'info'
        });
        const res = await getPayOrders();
        setPayOrders(res);
      } catch (error: any) {
        toast({
          title: error?.message,
          status: 'warning'
        });
        console.log(error);
      }

      setIsLoading(false);
    },
    [setIsLoading, toast]
  );

  const { isInitialLoading } = useQuery(['initPayOrder'], getPayOrders, {
    onSuccess(res) {
      setPayOrders(res);
    }
  });

  return (
    <>
      <TableContainer>
        <Table>
          <Thead>
            <Tr>
              <Th>订单号</Th>
              <Th>时间</Th>
              <Th>金额</Th>
              <Th>状态</Th>
              <Th></Th>
            </Tr>
          </Thead>
          <Tbody fontSize={'sm'}>
            {payOrders.map((item) => (
              <Tr key={item._id}>
                <Td>{item.orderId}</Td>
                <Td>
                  {item.createTime ? dayjs(item.createTime).format('YYYY/MM/DD HH:mm:ss') : '-'}
                </Td>
                <Td>{formatPrice(item.price)}元</Td>
                <Td>{item.status}</Td>
                <Td>
                  {item.status === 'NOTPAY' && (
                    <Button onClick={() => handleRefreshPayOrder(item._id)} size={'sm'}>
                      更新
                    </Button>
                  )}
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </TableContainer>
      {!isInitialLoading && payOrders.length === 0 && (
        <Flex h={'100%'} flexDirection={'column'} alignItems={'center'} pt={'100px'}>
          <MyIcon name="empty" w={'48px'} h={'48px'} color={'transparent'} />
          <Box mt={2} color={'myGray.500'}>
            无支付记录~
          </Box>
        </Flex>
      )}
      <Loading loading={isInitialLoading} fixed={false} />
    </>
  );
};

export default PayRecordTable;
