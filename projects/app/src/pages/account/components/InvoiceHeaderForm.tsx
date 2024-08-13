import Divider from '@/pages/app/detail/components/WorkflowComponents/Flow/components/Divider';
import { getTeamInvoiceHeader, updateTeamInvoiceHeader } from '@/web/support/user/team/api';
import { Box, Button, Flex, Input, Radio, RadioGroup, Stack } from '@chakra-ui/react';
import { TeamInvoiceHeaderType } from '@fastgpt/global/support/user/team/type';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@fastgpt/web/hooks/useToast';

const InputItem = ({
  label,
  value,
  onChange,
  name
}: {
  label: string;
  value: string;
  onChange: (e: any) => void;
  name: string;
}) => {
  return (
    <>
      <Flex justify={'space-between'}>
        <Box fontSize={'14px'} lineHeight={'2rem'}>
          {label}
        </Box>
        <Input w={'21.25rem'} placeholder={label} value={value} onChange={onChange} name={name} />
      </Flex>
    </>
  );
};

export const InvoiceHeaderSingleForm = ({
  formData,
  handleChange,
  handleRatiosChange
}: {
  formData: TeamInvoiceHeaderType;
  handleChange: (e: any) => void;
  handleRatiosChange: (v: string) => void;
}) => {
  const { t } = useTranslation();
  return (
    <>
      <Flex w={'36rem'} flexDir={'column'} gap={'1rem'}>
        <InputItem
          label={t('common:support.wallet.invoice_data.organization_name')}
          value={formData.teamName}
          onChange={handleChange}
          name="teamName"
        />
        <InputItem
          label={t('common:support.wallet.invoice_data.unit_code')}
          value={formData.unifiedCreditCode}
          onChange={handleChange}
          name="unifiedCreditCode"
        />
        <InputItem
          label={t('common:support.wallet.invoice_data.company_address')}
          value={formData.companyAddress}
          onChange={handleChange}
          name="companyAddress"
        />
        <InputItem
          label={t('common:support.wallet.invoice_data.company_phone')}
          value={formData.companyPhone}
          onChange={handleChange}
          name="companyPhone"
        />
        <InputItem
          label={t('common:support.wallet.invoice_data.bank')}
          value={formData.bankName}
          onChange={handleChange}
          name="bankName"
        />
        <InputItem
          label={t('common:support.wallet.invoice_data.bank_account')}
          value={formData.bankAccount}
          onChange={handleChange}
          name="bankAccount"
        />
        <Flex justify={'space-between'}>
          <Box fontSize={'14px'} lineHeight={'2rem'}>
            {t('common:support.wallet.invoice_data.need_special_invoice')}
          </Box>
          <RadioGroup
            value={formData.needSpecialInvoice ? 'true' : 'false'}
            onChange={handleRatiosChange}
            w={'21.25rem'}
          >
            <Stack direction="row" h={'2rem'}>
              <Radio value="true" pr={'1rem'}>
                <Box fontSize={'14px'}>{t('common:yes')}</Box>
              </Radio>
              <Radio value="false">
                <Box fontSize={'14px'}>{t('common:no')}</Box>
              </Radio>
            </Stack>
          </RadioGroup>
        </Flex>
        <Box w={'100%'}>
          <Divider />
        </Box>
        <InputItem
          label={t('common:support.wallet.invoice_data.email')}
          value={formData.emailAddress}
          onChange={handleChange}
          name="emailAddress"
        />
      </Flex>
    </>
  );
};

const InvoiceHeaderForm = () => {
  const [formData, setFormData] = useState<TeamInvoiceHeaderType>({
    teamName: '',
    unifiedCreditCode: '',
    companyAddress: '',
    companyPhone: '',
    bankName: '',
    bankAccount: '',
    needSpecialInvoice: false,
    emailAddress: ''
  });
  const { loading: isLoading } = useRequest2(() => getTeamInvoiceHeader(), {
    manual: false,
    onSuccess: (data) => {
      setFormData(data);
    }
  });
  const { t } = useTranslation();
  const { toast } = useToast();
  const handleChange = useCallback((e: any) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  }, []);
  const handleRatiosChange = useCallback((v: string) => {
    setFormData((prev) => ({ ...prev, needSpecialInvoice: v === 'true' }));
  }, []);
  const isHeaderValid = useCallback((v: TeamInvoiceHeaderType) => {
    const emailRegex = /\w+([-+.]\w+)*@\w+([-.]\w+)*\.\w+([-.]\w+)*/;
    return emailRegex.test(v.emailAddress);
  }, []);
  const { loading: isSubmitting, run: handleSubmit } = useRequest2(
    () => updateTeamInvoiceHeader(formData),
    {
      manual: true,
      successToast: t('common:common.submit_success'),
      errorToast: t('common:common.Submit failed')
    }
  );
  const onSubmit = useCallback(() => {
    if (!isHeaderValid(formData)) {
      toast({
        title: t('common:support.wallet.invoice_data.in_valid'),
        status: 'info'
      });
      return;
    }
    handleSubmit();
  }, [handleSubmit, formData, isHeaderValid, toast, t]);
  return (
    <>
      <MyBox isLoading={isLoading} pt="3.5rem">
        <Flex w={'100%'} justify={'center'} flexDir={'column'} align={'center'}>
          <InvoiceHeaderSingleForm
            formData={formData}
            handleChange={handleChange}
            handleRatiosChange={handleRatiosChange}
          />
          <Flex w={'100%'} justify={'center'} mt={'3rem'}>
            <Button variant={'primary'} px="0" onClick={onSubmit} isDisabled={isSubmitting}>
              <Flex alignItems={'center'} px={'20px'}>
                <Box px={'1.25rem'} py={'0.5rem'}>
                  {isSubmitting ? t('common:common.submitting') : t('common:common.Save')}
                </Box>
              </Flex>
            </Button>
          </Flex>
        </Flex>
      </MyBox>
    </>
  );
};

export default InvoiceHeaderForm;
