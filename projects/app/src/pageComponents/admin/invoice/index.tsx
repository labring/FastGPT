'use client';
import BoxPageRoot from '@/components/admin/BoxContainer/PageRoot';
import { finishInvoice, getInvoiceList } from '@/web/support/wallet/invoice/api';
import {
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Flex,
  Box,
  HStack,
  InputGroup,
  Input,
  InputLeftElement,
  Button,
  FormLabel
} from '@chakra-ui/react';
import type { InvoiceSchemaType } from '@fastgpt/global/support/wallet/bill/type';
import { FixedTableContainer } from '@fastgpt/web/components/common/FixedTable';
import { formatStorePrice2Read } from '@fastgpt/global/support/wallet/usage/tools';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import { usePagination } from '@fastgpt/web/hooks/usePagination';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import dayjs from 'dayjs';
import { useCallback, useRef, useState } from 'react';
import { useSelectFile } from '@fastgpt/web/common/file/hooks/useSelectFile';
import { InvoiceStatusEnum } from '@fastgpt/global/support/wallet/bill/invoice/constants';
import { accountTitleTextStyles } from '@/pageComponents/account/styles';
import { downloadFetch } from '@/web/common/system/utils';

const InvoiceManageTable = () => {
  const [search, setSearch] = useState<string>();
  const [uploadInvoiceId, setUploadInvoiceId] = useState<string>();
  const [invoiceDetailData, setInvoiceDetailData] = useState<InvoiceSchemaType>();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const {
    data: invoices,
    isLoading,
    Pagination,
    total,
    pageSize,
    getData
  } = usePagination(getInvoiceList, {
    defaultPageSize: 20,
    pageSizeCacheKey: 'users-invoice-list',
    params: {
      search
    },
    refreshDeps: [search],
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
          开票管理
        </Box>
        <Box flexGrow={1}></Box>
        <InputGroup w={['100%', '250px']} h={'36px'}>
          <InputLeftElement h={'full'}>
            <MyIcon name="common/searchLight" w={4} color={'myGray.400'} />
          </InputLeftElement>
          <Input
            placeholder="请输入用户名，回车搜索"
            h={'36px'}
            onChange={(e) => setSearch(e.target.value)}
          ></Input>
        </InputGroup>
      </Flex>

      <FixedTableContainer
        ref={scrollContainerRef}
        position={'relative'}
        h={'100%'}
        maxH={'none'}
        horizontalScroll
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
              <Th>提交状态</Th>
              <Th>提交时间/完成时间</Th>
              <Th>金额</Th>
              <Th>抬头</Th>
              <Th>联系方式</Th>
              <Th>操作</Th>
              <Th>Team Id</Th>
            </Tr>
          </Thead>
          <Tbody fontSize={'sm'}>
            {invoices.map((item, i) => (
              <Tr key={i}>
                <Td
                  {...(item.status === InvoiceStatusEnum.submitted
                    ? {
                        color: 'red.600'
                      }
                    : {
                        color: 'primary.600'
                      })}
                >
                  {item.status === InvoiceStatusEnum.submitted ? '等待开票' : '已完成'}
                </Td>
                <Td>
                  {item.createTime ? dayjs(item.createTime).format('YYYY/MM/DD HH:mm:ss') : '-'}
                  <br />
                  {item.finishTime ? dayjs(item.finishTime).format('YYYY/MM/DD HH:mm:ss') : '-'}
                </Td>
                <Td>{formatStorePrice2Read(item.amount)}元</Td>
                <Td>{item.teamName}</Td>
                <Td>{item.contactPhone || '-'}</Td>
                <Td>
                  {item.status === InvoiceStatusEnum.submitted ? (
                    <Button
                      variant={'whiteBase'}
                      onClick={() => setUploadInvoiceId(item._id)}
                      size={'sm'}
                    >
                      {'确认开票'}
                    </Button>
                  ) : (
                    <Button
                      variant={'whiteBase'}
                      size={'sm'}
                      onClick={() => setInvoiceDetailData(item)}
                    >
                      详情
                    </Button>
                  )}
                </Td>
                <Td>{item.teamId}</Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
        {!isLoading && invoices.length === 0 && (
          <Flex
            mt={'20vh'}
            flexDirection={'column'}
            alignItems={'center'}
            justifyContent={'center'}
          >
            <MyIcon name="empty" w={'48px'} h={'48px'} color={'transparent'} />
            <Box mt={2} color={'myGray.500'}>
              无开票记录～
            </Box>
          </Flex>
        )}
        {!!invoiceDetailData && (
          <InvoiceDetailModal
            invoice={invoiceDetailData}
            onClose={() => setInvoiceDetailData(undefined)}
            flashData={() => getData(1)}
          />
        )}
        {uploadInvoiceId && (
          <InvoiceFinishModal
            invoice={invoices.find((item) => item._id === uploadInvoiceId)!}
            invoiceId={uploadInvoiceId}
            onClose={() => setUploadInvoiceId(undefined)}
            flashData={() => getData(1)}
          />
        )}
      </FixedTableContainer>
    </BoxPageRoot>
  );
};
export default InvoiceManageTable;

function InvoiceDetailModal({
  invoice,
  onClose,
  flashData
}: {
  invoice: InvoiceSchemaType;
  onClose: () => void;
  flashData: () => void;
}) {
  const { File, onOpen: onOpenSelectFile } = useSelectFile({});

  const { loading, run: uploadInvoice } = useRequest(
    (metadata: Record<string, any>, file: File) => {
      const formData = new FormData();
      formData.append('file', file, encodeURIComponent(file.name));
      formData.append('data', JSON.stringify(metadata));
      return finishInvoice(formData);
    },
    {
      manual: true,
      successToast: '修改成功',
      errorToast: '修改失败',
      onSuccess: () => {
        flashData();
      }
    }
  );

  const { loading: isDownloading, run: downloadInvoice } = useRequest(
    async () => {
      await downloadFetch({
        url: `/api/proApi/admin/support/wallet/bill/invoice/downloadFile?id=${encodeURIComponent(invoice._id)}`,
        filename: `${invoice.teamName}.pdf`
      });
    },
    { manual: true, errorToast: '发票下载失败' }
  );

  const onSelectFile = useCallback(
    (e: File[]) => {
      const file = e[0];
      if (!file) return;
      uploadInvoice({ invoiceId: invoice._id }, file);
    },
    [invoice._id, uploadInvoice]
  );

  return (
    <MyModal
      maxW={['90vw', '700px']}
      isOpen={true}
      onClose={onClose}
      isLoading={loading}
      title={
        <Flex align={'center'}>
          <MyIcon name="paragraph" w={'20px'} h={'20px'} color={'blue.600'} />
          <Box ml={'0.62rem'}>{'发票详情'}</Box>
        </Flex>
      }
    >
      <Flex w={'100%'} h={'100%'} flexDir={'column'} gap={'1rem'}>
        <LabelItem label={'开票金额'} value={formatStorePrice2Read(invoice?.amount) + '元'} />
        <LabelItem label={'组织名称'} value={invoice?.teamName} />
        <LabelItem label={'统一信用代码'} value={invoice?.unifiedCreditCode} />
        <LabelItem label={'公司地址'} value={invoice?.companyAddress} />
        <LabelItem label={'公司电话'} value={invoice?.companyPhone} />
        <LabelItem label={'开户银行'} value={invoice?.bankName} />
        <LabelItem label={'开户账号'} value={invoice?.bankAccount} />
        <LabelItem label={'是否需要专票'} value={invoice?.needSpecialInvoice ? '是' : '否'} />
        <LabelItem label={'邮箱地址'} value={invoice?.emailAddress} />
        <Flex alignItems={'center'} justify={'space-between'}>
          <FormLabel flex={'0 0 120px'}>发票文件</FormLabel>
          <HStack spacing={4}>
            <Button variant={'whiteBase'} size={'sm'} onClick={onOpenSelectFile}>
              修改发票
            </Button>
            <Button
              variant={'primary'}
              size={'sm'}
              isLoading={isDownloading}
              onClick={() => downloadInvoice()}
            >
              点击下载
            </Button>
          </HStack>
        </Flex>
      </Flex>

      <File onSelect={onSelectFile} />
    </MyModal>
  );
}

function LabelItem({ label, value }: { label: string; value?: string }) {
  return (
    <Flex alignItems={'center'} justify={'space-between'}>
      <FormLabel flex={'0 0 120px'}>{label}</FormLabel>
      <Box>{value}</Box>
    </Flex>
  );
}

function InvoiceFinishModal({
  onClose,
  invoiceId,
  flashData,
  invoice
}: {
  onClose: () => void;
  invoiceId: string;
  flashData: () => void;
  invoice: InvoiceSchemaType;
}) {
  const [selectedFile, setSelectedFile] = useState<File>();
  const { File, onOpen: onOpenSelectFile } = useSelectFile({});
  const { loading, run: uploadInvoice } = useRequest(
    (metadata: Record<string, any>, file: File) => {
      const formData = new FormData();
      formData.append('file', file, encodeURIComponent(file.name));
      formData.append('data', JSON.stringify(metadata));
      return finishInvoice(formData);
    },
    {
      manual: true,
      successToast: '操作成功',
      errorToast: '操作失败',
      onSuccess: () => {
        flashData();
        onClose();
      }
    }
  );
  const onSelectFile = useCallback((e: File[]) => {
    const file = e[0];
    if (!file) return;
    setSelectedFile(file);
  }, []);

  return (
    <MyModal
      isCentered
      title={'确认开票'}
      isOpen
      footer={
        <Flex justify={'space-between'} gap={'1rem'} w={'100%'}>
          <Button variant={'whiteBase'} onClick={onClose}>
            关闭
          </Button>
          <Button
            isDisabled={!selectedFile}
            isLoading={loading}
            onClick={() => uploadInvoice({ invoiceId }, selectedFile!)}
          >
            确认提交
          </Button>
        </Flex>
      }
    >
      <Box fontWeight={'600'} fontSize={'1rem'}>
        请上传发票的PDF文件
      </Box>
      <Flex flexDir={'column'} gap={'4'} w={'100%'}>
        <LabelItem label={'开票金额'} value={formatStorePrice2Read(invoice?.amount) + '元'} />
        <LabelItem label={'组织名称'} value={invoice?.teamName} />
        <LabelItem label={'统一信用代码'} value={invoice?.unifiedCreditCode} />
        <LabelItem label={'公司地址'} value={invoice?.companyAddress} />
        <LabelItem label={'公司电话'} value={invoice?.companyPhone} />
        <LabelItem label={'开户银行'} value={invoice?.bankName} />
        <LabelItem label={'开户账号'} value={invoice?.bankAccount} />
        <LabelItem label={'是否需要专票'} value={invoice?.needSpecialInvoice ? '是' : '否'} />
        <LabelItem label={'邮箱地址'} value={invoice?.emailAddress} />
      </Flex>

      <Flex w={'100%'} mt={4}>
        <FormLabel flex={'0 0 120px'}>发票文件</FormLabel>
        <Box
          textAlign={'end'}
          flex={'1 0 0'}
          onClick={onOpenSelectFile}
          fontWeight={'bold'}
          cursor={'pointer'}
          {...(selectedFile
            ? {}
            : {
                color: 'red.600'
              })}
        >
          {selectedFile ? selectedFile.name : '选择发票文件'}
        </Box>
      </Flex>

      <File onSelect={onSelectFile} />
    </MyModal>
  );
}
