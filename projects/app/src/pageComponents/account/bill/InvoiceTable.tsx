import { getInvoiceRecords } from '@/web/support/wallet/bill/invoice/api';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { useTranslation } from 'next-i18next';
import { useState } from 'react';
import {
  Box,
  Button,
  Flex,
  FormLabel,
  ModalBody,
  Table,
  TableContainer,
  Tbody,
  Td,
  Th,
  Thead,
  Tr
} from '@chakra-ui/react';
import { usePagination } from '@fastgpt/web/hooks/usePagination';
import { type InvoiceSchemaType } from '@fastgpt/global/support/wallet/bill/type';
import MyIcon from '@fastgpt/web/components/common/Icon';
import dayjs from 'dayjs';
import { formatStorePrice2Read } from '@fastgpt/global/support/wallet/usage/tools';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { downloadFetch } from '@/web/common/system/utils';

const InvoiceTable = () => {
  const { t } = useTranslation();
  const [invoiceDetailData, setInvoiceDetailData] = useState<InvoiceSchemaType | ''>('');
  const {
    data: invoices,
    isLoading,
    Pagination,
    total
  } = usePagination(getInvoiceRecords, {
    pageSize: 20
  });

  return (
    <MyBox isLoading={isLoading} position={'relative'} h={'100%'} overflow={'overlay'}>
      <TableContainer minH={'50vh'}>
        <Table>
          <Thead h="3rem">
            <Tr>
              <Th w={'20%'}>#</Th>
              <Th w={'20%'}>{t('account_bill:time')}</Th>
              <Th w={'20%'}>{t('account_bill:support_wallet_amount')}</Th>
              <Th w={'20%'}>{t('account_bill:status')}</Th>
              <Th w={'20%'}></Th>
            </Tr>
          </Thead>
          <Tbody fontSize={'sm'}>
            {invoices.map((item, i) => (
              <Tr key={item._id}>
                <Td>{i + 1}</Td>
                <Td>
                  {item.createTime ? dayjs(item.createTime).format('YYYY/MM/DD HH:mm:ss') : '-'}
                </Td>
                <Td>{t('account_bill:yuan', { amount: formatStorePrice2Read(item.amount) })}</Td>
                <Td>
                  <Flex
                    px={'0.75rem'}
                    py={'0.38rem'}
                    w={'4.25rem'}
                    h={'1.75rem'}
                    bg={item.status === 1 ? 'blue.50' : 'green.50'}
                    rounded={'md'}
                    justify={'center'}
                    align={'center'}
                    color={item.status === 1 ? 'blue.600' : 'green.600'}
                  >
                    <MyIcon name="point" w={'6px'} h={'6px'} />
                    <Box ml={'0.25rem'}>
                      {item.status === 1
                        ? t('account_bill:submitted')
                        : t('account_bill:completed')}
                    </Box>
                  </Flex>
                </Td>
                <Td>
                  <Button
                    onClick={() => setInvoiceDetailData(item)}
                    h={'2rem'}
                    w={'4.5rem'}
                    variant={'whiteBase'}
                    size={'sm'}
                    py={'0.5rem'}
                    px={'0.75rem'}
                    _hover={{
                      color: 'blue.600'
                    }}
                  >
                    <Flex>
                      <MyIcon name="paragraph" w={'16px'} h={'16px'} />
                      <Box ml={'0.38rem'}>{t('account_bill:detail')}</Box>
                    </Flex>
                  </Button>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
        {total >= 20 && (
          <Flex mt={3} justifyContent={'flex-end'}>
            <Pagination />
          </Flex>
        )}
        {!isLoading && invoices.length === 0 && (
          <Flex
            mt={'20vh'}
            flexDirection={'column'}
            alignItems={'center'}
            justifyContent={'center'}
          >
            <MyIcon name="empty" w={'48px'} h={'48px'} color={'transparent'} />
            <Box mt={2} color={'myGray.500'}>
              {t('account_bill:no_invoice_record_tip')}
            </Box>
          </Flex>
        )}
      </TableContainer>
      {!!invoiceDetailData && (
        <InvoiceDetailModal invoice={invoiceDetailData} onClose={() => setInvoiceDetailData('')} />
      )}
    </MyBox>
  );
};

export default InvoiceTable;

function InvoiceDetailModal({
  invoice,
  onClose
}: {
  invoice: InvoiceSchemaType;
  onClose: () => void;
}) {
  const { t } = useTranslation();

  const { runAsync: handleDownloadInvoice } = useRequest2(async (id: string) => {
    await downloadFetch({
      url: `/api/proApi/support/wallet/bill/invoice/downloadFile?id=${id}`,
      filename: `${invoice.teamName}.pdf`
    });
  });

  return (
    <MyModal
      maxW={['90vw', '700px']}
      isOpen={true}
      onClose={onClose}
      title={
        <Flex align={'center'}>
          <MyIcon name="paragraph" w={'20px'} h={'20px'} color={'blue.600'} />
          <Box ml={'0.62rem'}>{t('account_bill:invoice_detail')}</Box>
        </Flex>
      }
    >
      <ModalBody px={'3.25rem'} py={'2rem'}>
        <Flex w={'100%'} h={'100%'} flexDir={'column'} gap={'1rem'}>
          <LabelItem
            label={t('account_bill:invoice_amount')}
            value={t('account_bill:yuan', { amount: formatStorePrice2Read(invoice.amount) })}
          />
          <LabelItem label={t('account_bill:organization_name')} value={invoice.teamName} />
          <LabelItem label={t('account_bill:unit_code')} value={invoice.unifiedCreditCode} />
          <LabelItem label={t('account_bill:company_address')} value={invoice.companyAddress} />
          <LabelItem label={t('account_bill:company_phone')} value={invoice.companyPhone} />
          <LabelItem label={t('account_bill:bank_name')} value={invoice.bankName} />
          <LabelItem label={t('account_bill:bank_account')} value={invoice.bankAccount} />
          <LabelItem
            label={t('account_bill:need_special_invoice')}
            value={invoice.needSpecialInvoice ? t('account_bill:yes') : t('account_bill:no')}
          />
          <LabelItem label={t('account_bill:contact_phone')} value={invoice.contactPhone} />
          <LabelItem label={t('account_bill:email_address')} value={invoice.emailAddress} />
          {invoice.status === 2 && (
            <Flex alignItems={'center'} justify={'space-between'}>
              <FormLabel flex={'0 0 120px'}>{t('account_bill:Invoice_document')}</FormLabel>
              <Box cursor={'pointer'} onClick={() => handleDownloadInvoice(invoice._id)}>
                {t('account_bill:click_to_download')}
              </Box>
            </Flex>
          )}
        </Flex>
      </ModalBody>
    </MyModal>
  );
}

function LabelItem({ label, value }: { label: string; value?: string }) {
  return (
    <Flex alignItems={'center'} justify={'space-between'}>
      <FormLabel flex={'0 0 120px'}>{label}</FormLabel>
      <Box>{value || '-'}</Box>
    </Flex>
  );
}
