'use client';
import React, { useRef, useState } from 'react';
import {
  Button,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Flex,
  Box,
  InputGroup,
  Input,
  InputLeftElement
} from '@chakra-ui/react';
import type { BillItemType } from '@fastgpt/global/openapi/admin/wallet/pay/api';
import dayjs from 'dayjs';
import { formatStorePrice2Read } from '@fastgpt/global/support/wallet/usage/tools';
import MyIcon from '@fastgpt/web/components/common/Icon';
import {
  BillPayWayEnum,
  BillStatusEnum,
  BillTypeEnum
} from '@fastgpt/global/support/wallet/bill/constants';
import { StandardSubLevelEnum, SubModeEnum } from '@fastgpt/global/support/wallet/sub/constants';
import MyTag from '@fastgpt/web/components/common/Tag';
import SingleSelectFilter from '@fastgpt/web/components/common/TagFilter/SingleSelectFilter';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import { usePagination } from '@fastgpt/web/hooks/usePagination';
import { getPays } from '@/web/admin/wallet/pay/api';
import BoxPageRoot from '@/components/admin/BoxContainer/PageRoot';
import { FixedTableContainer } from '@fastgpt/web/components/common/FixedTable';
import { accountTitleTextStyles } from '@/pageComponents/account/styles';

const billTypeList: { label: string; value: BillTypeEnum | '' }[] = [
  { label: '全部', value: '' },
  { label: '余额充值', value: BillTypeEnum.balance },
  { label: '套餐订阅', value: BillTypeEnum.standSubPlan },
  { label: '知识库扩容', value: BillTypeEnum.extraDatasetSub },
  { label: 'AI积分套餐', value: BillTypeEnum.extraPoints },
  { label: '活动赠送', value: BillTypeEnum.activityGift }
];

const billStatusList: { label: string; value: BillStatusEnum | '' }[] = [
  { label: '全部', value: '' },
  { label: '成功', value: BillStatusEnum.SUCCESS },
  { label: '已退款', value: BillStatusEnum.REFUND },
  { label: '未支付', value: BillStatusEnum.NOTPAY },
  { label: '已关闭', value: BillStatusEnum.CLOSED }
];

const billStatusTagMap = {
  [BillStatusEnum.SUCCESS]: { label: '成功', colorSchema: 'green' },
  [BillStatusEnum.REFUND]: { label: '已退款', colorSchema: 'red' },
  [BillStatusEnum.NOTPAY]: { label: '未支付', colorSchema: 'yellow' },
  [BillStatusEnum.CLOSED]: { label: '已关闭', colorSchema: 'gray' }
} as const;

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
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const {
    data: bills,
    isLoading,
    Pagination,
    total,
    pageSize
  } = usePagination(getPays, {
    defaultPageSize: 20,
    pageSizeCacheKey: 'users-pays-list',
    params: {
      type: billType === '' ? undefined : billType,
      status: billStatus === '' ? undefined : billStatus,
      username: username ?? ''
    },
    refreshDeps: [billType, billStatus, username],
    scrollContainerRef
  });

  return (
    <BoxPageRoot display={'flex'} flexDirection={'column'} h={'100%'} p={0}>
      <Flex
        h={'64px'}
        flexShrink={0}
        px={6}
        alignItems={'center'}
        gap={2}
        borderBottom={'1px solid'}
        borderColor={'myGray.200'}
      >
        <Box as={'h1'} {...accountTitleTextStyles}>
          支付记录
        </Box>
        <Box flexGrow={1}></Box>
        <InputGroup w={['100%', '250px']} h={'36px'}>
          <InputLeftElement h={'full'}>
            <MyIcon name="common/searchLight" w={4} color={'myGray.400'} />
          </InputLeftElement>
          <Input
            placeholder="请输入用户名搜索"
            onChange={(e) => setUsername(e.target.value)}
            h={'36px'}
          ></Input>
        </InputGroup>
        <SingleSelectFilter<BillTypeEnum | ''>
          storageKey={'admin.pays.type'}
          title={'套餐类型'}
          options={billTypeList}
          value={billType}
          onChange={setBillType}
          maxW={'220px'}
        />
        <SingleSelectFilter<BillStatusEnum | ''>
          storageKey={'admin.pays.status'}
          title={'状态'}
          options={billStatusList}
          value={billStatus}
          onChange={setBillStatus}
        />
      </Flex>

      <FixedTableContainer
        ref={scrollContainerRef}
        position={'relative'}
        flex={1}
        maxH={'none'}
        px={[4, 6]}
        py={6}
        footer={
          total > pageSize ? (
            <Flex mt={3} justifyContent={'center'}>
              <Pagination />
            </Flex>
          ) : undefined
        }
      >
        <Table>
          <Thead>
            <Tr>
              <Th>时间</Th>
              <Th>团队ID</Th>
              <Th>套餐类型</Th>
              <Th>金额</Th>
              <Th>状态</Th>
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
                <Td>{billTypeMap[item.type]?.label}</Td>
                <Td>{formatStorePrice2Read(item.price)}元</Td>
                <Td>
                  {billStatusTagMap[item.status] ? (
                    <MyTag colorSchema={billStatusTagMap[item.status].colorSchema} type={'fill'}>
                      {billStatusTagMap[item.status].label}
                    </MyTag>
                  ) : (
                    item.status
                  )}
                </Td>
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
      </FixedTableContainer>

      {!!billDetail && (
        <BillDetailModal bill={billDetail} onClose={() => setBillDetail(undefined)} />
      )}
    </BoxPageRoot>
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
      <Flex alignItems={'center'} pb={4}>
        <Box flex={'0 0 120px'}>充值的成员名:</Box>
        <Box>{bill.username || '-'}</Box>
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
