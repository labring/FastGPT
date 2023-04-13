import React, { useState, useCallback } from 'react';
import {
  Card,
  Box,
  Flex,
  Button,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  TableContainer,
  useDisclosure
} from '@chakra-ui/react';
import { getPayOrders, checkPayResult } from '@/api/user';
import { PaySchema } from '@/types/mongoSchema';
import dayjs from 'dayjs';
import { useQuery } from '@tanstack/react-query';
import { formatPrice } from '@/utils/user';
import WxConcat from '@/components/WxConcat';
import { useGlobalStore } from '@/store/global';
import { useToast } from '@/hooks/useToast';

const PayRecordTable = () => {
  const { isOpen: isOpenWx, onOpen: onOpenWx, onClose: onCloseWx } = useDisclosure();
  const [payOrders, setPayOrders] = useState<PaySchema[]>([]);
  const { setLoading } = useGlobalStore();
  const { toast } = useToast();

  const handleRefreshPayOrder = useCallback(
    async (payId: string) => {
      setLoading(true);

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

      setLoading(false);
    },
    [setLoading, toast]
  );

  useQuery(['initPayOrder'], getPayOrders, {
    onSuccess(res) {
      setPayOrders(res);
    }
  });

  return (
    <>
      <Card mt={6} py={4}>
        <Flex alignItems={'flex-end'} px={6} mb={1}>
          <Box fontSize={'xl'} fontWeight={'bold'}>
            充值记录
          </Box>
          <Button onClick={onOpenWx} size={'xs'} ml={4} variant={'outline'}>
            异常问题，wx联系
          </Button>
        </Flex>
        <TableContainer px={6}>
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
      </Card>
      {/* wx 联系 */}
      {isOpenWx && <WxConcat onClose={onCloseWx} />}
    </>
  );
};

export default PayRecordTable;
