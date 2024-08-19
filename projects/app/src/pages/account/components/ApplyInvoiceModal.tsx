import {
  getInvoiceBillsList,
  invoiceBillDataType,
  submitInvoice
} from '@/web/support/wallet/bill/invoice/api';
import {
  Box,
  Button,
  Checkbox,
  Flex,
  Table,
  TableContainer,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  useDisclosure
} from '@chakra-ui/react';
import { billTypeMap } from '@fastgpt/global/support/wallet/bill/constants';
import { formatStorePrice2Read } from '@fastgpt/global/support/wallet/usage/tools';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import dayjs from 'dayjs';
import { useTranslation } from 'next-i18next';
import { useCallback, useState } from 'react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import Divider from '@/pages/app/detail/components/WorkflowComponents/Flow/components/Divider';
import { TeamInvoiceHeaderType } from '@fastgpt/global/support/user/team/type';
import { InvoiceHeaderSingleForm } from './InvoiceHeaderForm';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { getTeamInvoiceHeader } from '@/web/support/user/team/api';
import { useToast } from '@fastgpt/web/hooks/useToast';
type chosenBillDataType = {
  _id: string;
  price: number;
};
const ApplyInvoiceModal = ({ onClose }: { onClose: () => void }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [chosenBillDataList, setChosenBillDataList] = useState<chosenBillDataType[]>([]);
  const [totalPrice, setTotalPrice] = useState(0);
  const [formData, setFormData] = useState<TeamInvoiceHeaderType>({
    teamName: '',
    unifiedCreditCode: '',
    companyAddress: '',
    companyPhone: '',
    bankName: '',
    bankAccount: '',
    needSpecialInvoice: undefined,
    emailAddress: ''
  });
  const {
    isOpen: isOpenSettleModal,
    onOpen: onOpenSettleModal,
    onClose: onCloseSettleModal
  } = useDisclosure();

  const handleChange = useCallback((e: any) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  }, []);

  const handleRatiosChange = useCallback((v: string) => {
    setFormData((prev) => ({ ...prev, needSpecialInvoice: v === 'true' }));
  }, []);

  const isHeaderValid = useCallback((v: TeamInvoiceHeaderType) => {
    const emailRegex = /\w+([-+.]\w+)*@\w+([-.]\w+)*\.\w+([-.]\w+)*/;
    for (const [key, value] of Object.entries(v)) {
      if (typeof value === 'string' && value.trim() === '') {
        return false;
      }
    }
    return emailRegex.test(v.emailAddress);
  }, []);

  const {
    loading: isLoading,
    data: billsList,
    run: getInvoiceBills
  } = useRequest2(() => getInvoiceBillsList(), {
    manual: false
  });

  const { run: handleSubmitInvoice, loading: isSubmitting } = useRequest2(
    () =>
      submitInvoice({
        amount: totalPrice,
        billIdList: chosenBillDataList.map((item) => item._id),
        ...formData
      }),
    {
      manual: true,
      successToast: t('common:common.submit_success'),
      errorToast: t('common:common.Submit failed'),
      onSuccess: () => onClose()
    }
  );

  const { loading: isLoadingHeader } = useRequest2(() => getTeamInvoiceHeader(), {
    manual: false,
    onSuccess: (res) => setFormData(res)
  });

  const handleSubmit = useCallback(async () => {
    if (!isHeaderValid(formData)) {
      toast({
        title: t('common:support.wallet.invoice_data.in_valid'),
        status: 'info'
      });
      return;
    }
    handleSubmitInvoice();
  }, [formData, handleSubmitInvoice, isHeaderValid, t, toast]);

  const handleBack = useCallback(() => {
    setChosenBillDataList([]);
    getInvoiceBills();
    onCloseSettleModal();
  }, [getInvoiceBills, onCloseSettleModal]);

  const handleSingleCheck = useCallback(
    (item: invoiceBillDataType) => {
      if (chosenBillDataList.find((bill) => bill._id === item._id)) {
        setChosenBillDataList(chosenBillDataList.filter((bill) => bill._id !== item._id));
      } else {
        setChosenBillDataList([...chosenBillDataList, { _id: item._id, price: item.price }]);
      }
    },
    [chosenBillDataList]
  );

  return (
    <MyModal
      isOpen={true}
      isCentered
      iconSrc="/imgs/modal/invoice.svg"
      minHeight={'42.25rem'}
      w={'43rem'}
      onClose={onClose}
      isLoading={isLoading}
      title={t('common:support.wallet.apply_invoice')}
    >
      {!isOpenSettleModal ? (
        <Box px={['1.6rem', '3.25rem']} py={['1rem', '2rem']}>
          <Box fontWeight={500} fontSize={'1rem'} pb={'0.75rem'}>
            {t('common:support.wallet.billable_invoice')}
          </Box>
          <Box h={'27.9rem'} overflow={'auto'}>
            <TableContainer>
              <Table>
                <Thead>
                  <Tr>
                    <Th>
                      <Checkbox
                        isChecked={
                          chosenBillDataList.length === billsList?.length && billsList?.length !== 0
                        }
                        onChange={(e) => {
                          !e.target.checked
                            ? setChosenBillDataList([])
                            : setChosenBillDataList(
                                billsList?.map((item) => ({
                                  _id: item._id,
                                  price: item.price
                                })) || []
                              );
                        }}
                      />
                    </Th>
                    <Th>{t('common:user.type')}</Th>
                    <Th>{t('common:user.Time')}</Th>
                    <Th>{t('common:support.wallet.Amount')}</Th>
                  </Tr>
                </Thead>
                <Tbody fontSize={'0.875rem'}>
                  {billsList?.map((item) => (
                    <Tr
                      cursor={'pointer'}
                      key={item._id}
                      onClick={(e: any) => {
                        if (e.target?.name && e.target.name === 'check') return;
                        handleSingleCheck(item);
                      }}
                      _hover={{
                        bg: 'blue.50'
                      }}
                    >
                      <Td>
                        <Checkbox
                          name="check"
                          isChecked={chosenBillDataList.some((i) => i._id === item._id)}
                        />
                      </Td>
                      <Td>{t(billTypeMap[item.type]?.label as any)}</Td>
                      <Td>
                        {item.createTime
                          ? dayjs(item.createTime).format('YYYY/MM/DD HH:mm:ss')
                          : '-'}
                      </Td>
                      <Td>{t('common:pay.yuan', { amount: formatStorePrice2Read(item.price) })}</Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
              {!isLoading && billsList && billsList.length === 0 && (
                <Flex
                  mt={'20vh'}
                  flexDirection={'column'}
                  alignItems={'center'}
                  justifyContent={'center'}
                >
                  <MyIcon name="empty" w={'48px'} h={'48px'} color={'transparent'} />
                  <Box mt={2} color={'myGray.500'}>
                    {t('common:support.wallet.noBill')}
                  </Box>
                </Flex>
              )}
            </TableContainer>
          </Box>
          <Flex pt={'2.5rem'} justify={'flex-end'}>
            <Button
              variant={'primary'}
              px="0"
              isDisabled={!chosenBillDataList.length}
              onClick={() => {
                let total = chosenBillDataList.reduce((acc, cur) => acc + Number(cur.price), 0);
                if (!total) return;
                setTotalPrice(total);
                onOpenSettleModal();
              }}
            >
              <Flex alignItems={'center'}>
                <Box px={'1.25rem'} py={'0.5rem'}>
                  {t('common:common.Confirm')}
                </Box>
              </Flex>
            </Button>
          </Flex>
        </Box>
      ) : (
        <Box px={['1.6rem', '3.25rem']} py={['1rem', '2rem']}>
          <Box w={'100%'} fontSize={'0.875rem'}>
            <Flex w={'100%'} justifyContent={'space-between'}>
              <Box>{t('common:support.wallet.invoice_amount')}</Box>
              <Box>{t('common:pay.yuan', { amount: formatStorePrice2Read(totalPrice) })}</Box>
            </Flex>
            <Box w={'100%'} py={4}>
              <Divider showBorderBottom={false} />
            </Box>
          </Box>
          <MyBox isLoading={isLoadingHeader}>
            <Flex justify={'center'}>
              <InvoiceHeaderSingleForm
                formData={formData}
                handleChange={handleChange}
                handleRatiosChange={handleRatiosChange}
              />
            </Flex>
          </MyBox>
          <Flex
            align={'center'}
            w={'19.8rem'}
            h={'1.75rem'}
            mt={4}
            px={'0.75rem'}
            py={'0.38rem'}
            bg={'blue.50'}
            borderRadius={'sm'}
            color={'blue.600'}
          >
            <MyIcon name="infoRounded" w={'14px'} h={'14px'} />
            <Box ml={2} fontSize={'0.6875rem'}>
              {t('common:support.wallet.invoice_info')}
            </Box>
          </Flex>
          <Flex justify={'flex-end'} w={'100%'} pt={[3, 7]}>
            <Button variant={'outline'} mr={'0.75rem'} px="0" onClick={handleBack}>
              <Flex alignItems={'center'}>
                <Box px={'1.25rem'} py={'0.5rem'}>
                  {t('common:back')}
                </Box>
              </Flex>
            </Button>
            <Button isLoading={isSubmitting} px="0" onClick={handleSubmit}>
              <Flex alignItems={'center'}>
                <Box px={'1.25rem'} py={'0.5rem'}>
                  {t('common:common.Confirm')}
                </Box>
              </Flex>
            </Button>
          </Flex>
        </Box>
      )}
    </MyModal>
  );
};

export default ApplyInvoiceModal;
