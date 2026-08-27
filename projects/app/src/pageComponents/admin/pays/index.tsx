'use client';
import React, { useState } from 'react';
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
  Box,
  HStack,
  InputGroup,
  Input,
  InputLeftElement
} from '@chakra-ui/react';
import type { BillItemType } from '@fastgpt/global/openapi/admin/routes/pays/api';
import dayjs from 'dayjs';
import { formatStorePrice2Read } from '@fastgpt/global/support/wallet/usage/tools';
import MyIcon from '@fastgpt/web/components/common/Icon';
import {
  BillPayWayEnum,
  BillStatusEnum,
  BillTypeEnum
} from '@fastgpt/global/support/wallet/bill/constants';
import { StandardSubLevelEnum, SubModeEnum } from '@fastgpt/global/support/wallet/sub/constants';
import MySelect from '@fastgpt/web/components/common/MySelect';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import { usePagination } from '@fastgpt/web/hooks/usePagination';
import { getPays } from '@/web/admin/pays/api';
import BoxCard from '@/components/admin/BoxContainer/Card';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { accountTitleTextStyles } from '@/pageComponents/account/styles';

const billTypeList: { label: string; value: BillTypeEnum | '' }[] = [
  { label: '全部', value: '' },
  { label: '余额充值', value: BillTypeEnum.balance },
  { label: '套餐订阅', value: BillTypeEnum.standSubPlan },
  { label: '知识库扩容', value: BillTypeEnum.extraDatasetSub },
  { label: 'AI积分套餐', value: BillTypeEnum.extraPoints },
  { label: '活动赠送', value: BillTypeEnum.activityGift }
];

const billTypeMap = {
  [BillTypeEnum.balance]: {
    label: '余额充值'
  },
  [BillTypeEnum.standSubPlan]: {
    label: '套餐订阅'
  },
  [BillTypeEnum.extraDatasetSub]: {
    label: '知识库扩容'
  },
  [BillTypeEnum.extraPoints]: {
    label: 'AI积分套餐'
  },
  [BillTypeEnum.activityGift]: {
    label: '活动赠送'
  }
};

const subModeMap = {
  [SubModeEnum.month]: {
    label: '按月'
  },
  [SubModeEnum.year]: {
    label: '按年'
  }
};

export const standardSubLevelMap = {
  [StandardSubLevelEnum.free]: {
    label: '免费'
  },
  [StandardSubLevelEnum.custom]: {
    label: '定制'
  },
  [StandardSubLevelEnum.basic]: {
    label: '基础'
  },
  [StandardSubLevelEnum.advanced]: {
    label: '高级'
  },

  // deprecated
  [StandardSubLevelEnum.experience]: {
    label: '体验'
  },
  [StandardSubLevelEnum.team]: {
    label: '团队'
  },
  [StandardSubLevelEnum.enterprise]: {
    label: '企业'
  }
};

const billPayWayMap = {
  [BillPayWayEnum.wx]: {
    label: '微信'
  },
  [BillPayWayEnum.balance]: {
    label: '余额'
  },
  [BillPayWayEnum.alipay]: {
    label: '支付宝'
  },
  [BillPayWayEnum.bank]: {
    label: '对公'
  },
  [BillPayWayEnum.coupon]: {
    label: '兑换码'
  },
  [BillPayWayEnum.enterpriseAuth]: {
    label: '企业认证赠送'
  },
  [BillPayWayEnum.wecom]: {
    label: '企微'
  }
};

const BillTable = () => {
  const [username, setUsername] = useState<string>();
  const [billType, setBillType] = useState<BillTypeEnum | ''>('');
  const [billStatus, setBillStatus] = useState<BillStatusEnum | ''>(BillStatusEnum.SUCCESS);
  const [billDetail, setBillDetail] = useState<BillItemType>();
  const { isPc } = useSystem();

  const {
    data: bills,
    isLoading,
    ScrollData
  } = usePagination(getPays, {
    defaultPageSize: 20,
    pageSizeCacheKey: 'users-pays-list',
    params: {
      type: billType === '' ? undefined : billType,
      status: billStatus === '' ? undefined : billStatus,
      username: username ?? ''
    },
    type: 'scroll',
    refreshDeps: [billType, billStatus, username]
  });

  return (
    <BoxCard display={'flex'} flexDirection={'column'} h={'100%'}>
      <HStack pb={4}>
        {isPc && (
          <Box as={'h1'} {...accountTitleTextStyles}>
            支付记录
          </Box>
        )}
        <Box flexGrow={1}></Box>
        <InputGroup w={['100%', '250px']}>
          <InputLeftElement h={'full'}>
            <MyIcon name="common/searchLight" w={4} color={'myGray.400'} />
          </InputLeftElement>
          <Input
            placeholder="请输入用户名搜索"
            onChange={(e) => setUsername(e.target.value)}
            size={'sm'}
          ></Input>
        </InputGroup>
      </HStack>

      <ScrollData position={'relative'} flex={1}>
        <TableContainer>
          <Table>
            <Thead>
              <Tr>
                <Th>时间</Th>
                <Th>团队ID</Th>
                <Th>充值的成员名</Th>
                <Th>
                  <MySelect<BillTypeEnum | ''>
                    list={billTypeList}
                    value={billType}
                    size={'sm'}
                    onChange={(e) => {
                      setBillType(e);
                    }}
                    w={'130px'}
                  ></MySelect>
                </Th>
                <Th>金额</Th>
                <Th>
                  <MySelect<BillStatusEnum | ''>
                    list={[
                      { label: '全部', value: '' },
                      { label: '成功', value: BillStatusEnum.SUCCESS },
                      { label: '未支付', value: BillStatusEnum.NOTPAY }
                    ]}
                    value={billStatus}
                    size={'sm'}
                    onChange={(e) => {
                      setBillStatus(e);
                    }}
                    w={'130px'}
                  ></MySelect>
                </Th>
                <Th></Th>
              </Tr>
            </Thead>
            <Tbody fontSize={'sm'}>
              {bills.map((item) => (
                <Tr key={item._id}>
                  <Td>
                    {item.createTime ? dayjs(item.createTime).format('YYYY/MM/DD HH:mm:ss') : '-'}
                  </Td>
                  <Td>{item.teamId}</Td>
                  <Td>{item.username}</Td>
                  <Td>{billTypeMap[item.type]?.label}</Td>
                  <Td>{formatStorePrice2Read(item.price)}元</Td>
                  <Td>{item.status}</Td>
                  <Td>
                    <Button variant={'whiteBase'} size={'sm'} onClick={() => setBillDetail(item)}>
                      详情
                    </Button>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
          {!isLoading && bills.length === 0 && (
            <Flex
              mt={'20vh'}
              flexDirection={'column'}
              alignItems={'center'}
              justifyContent={'center'}
            >
              <MyIcon name="empty" w={'48px'} h={'48px'} color={'transparent'} />
              <Box mt={2} color={'myGray.500'}>
                无账单记录～
              </Box>
            </Flex>
          )}
        </TableContainer>
      </ScrollData>

      {!!billDetail && (
        <BillDetailModal bill={billDetail} onClose={() => setBillDetail(undefined)} />
      )}
    </BoxCard>
  );
};

export default BillTable;

function BillDetailModal({ bill, onClose }: { bill: BillItemType; onClose: () => void }) {
  return (
    <MyModal isOpen={true} onClose={onClose} title={'订单详情'} maxW={['90vw', '700px']}>
      <Flex alignItems={'center'} pb={4}>
        <Box flex={'0 0 120px'}>订单号:</Box>
        <Box>{bill.orderId}</Box>
      </Flex>
      <Flex alignItems={'center'} pb={4}>
        <Box flex={'0 0 120px'}>生成时间:</Box>
        <Box>{dayjs(bill.createTime).format('YYYY/MM/DD HH:mm:ss')}</Box>
      </Flex>
      {!!bill.metadata?.payWay && (
        <Flex alignItems={'center'} pb={4}>
          <Box flex={'0 0 120px'}>支付方式:</Box>
          <Box>{billPayWayMap[bill.metadata.payWay]?.label}</Box>
        </Flex>
      )}
      <Flex alignItems={'center'} pb={4}>
        <Box flex={'0 0 120px'}>金额:</Box>
        <Box>{formatStorePrice2Read(bill.price)}元</Box>
      </Flex>
      <Flex alignItems={'center'} pb={4}>
        <Box flex={'0 0 120px'}>订单类型:</Box>
        <Box>{billTypeMap[bill.type]?.label}</Box>
      </Flex>
      {!!bill.metadata?.subMode && (
        <Flex alignItems={'center'} pb={4}>
          <Box flex={'0 0 120px'}>订阅周期:</Box>
          <Box>{subModeMap[bill.metadata.subMode]?.label}</Box>
        </Flex>
      )}
      {!!bill.metadata?.standSubLevel && (
        <Flex alignItems={'center'} pb={4}>
          <Box flex={'0 0 120px'}>订阅套餐:</Box>
          <Box>{standardSubLevelMap[bill.metadata.standSubLevel]?.label}</Box>
        </Flex>
      )}
      {bill.metadata?.month !== undefined && (
        <Flex alignItems={'center'} pb={4}>
          <Box flex={'0 0 120px'}>月数:</Box>
          <Box>{bill.metadata?.month}</Box>
        </Flex>
      )}
      {bill.metadata?.datasetSize !== undefined && (
        <Flex alignItems={'center'} pb={4}>
          <Box flex={'0 0 120px'}>额外知识库容量:</Box>
          <Box>{bill.metadata?.datasetSize}</Box>
        </Flex>
      )}
      {bill.metadata?.extraPoints !== undefined && (
        <Flex alignItems={'center'} pb={4}>
          <Box flex={'0 0 120px'}>额外AI积分:</Box>
          <Box>{bill.metadata.extraPoints}</Box>
        </Flex>
      )}
    </MyModal>
  );
}
