import { Box, Card, Flex } from '@chakra-ui/react';
import React, { useCallback } from 'react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import { useUserStore } from '@/web/support/user/useUserStore';
import { UserType } from '@fastgpt/global/support/user/type';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useForm } from 'react-hook-form';
import { UserUpdateParams } from '@/types/user';
import TimezoneSelect from '@fastgpt/web/components/common/MySelect/TimezoneSelect';
import I18nLngSelector from '@/components/Select/I18nLngSelector';
import AccountContainer from './components/AccountContainer';
import { serviceSideProps } from '@/web/common/utils/i18n';

const Individuation = () => {
  const { t } = useTranslation();
  const { userInfo, updateUserInfo } = useUserStore();
  const { toast } = useToast();

  const { reset } = useForm<UserUpdateParams>({
    defaultValues: userInfo as UserType
  });

  const onclickSave = useCallback(
    async (data: UserType) => {
      await updateUserInfo({
        timezone: data.timezone
      });
      reset(data);
      toast({
        title: t('account_individuation:update_data_success'),
        status: 'success'
      });
    },
    [reset, t, toast, updateUserInfo]
  );

  return (
    <AccountContainer>
      <Box py={[3, '28px']} px={['5vw', '64px']}>
        <Flex alignItems={'center'} fontSize={'lg'} h={'30px'}>
          <MyIcon mr={2} name={'support/user/individuation'} w={'20px'} />
          {t('account_individuation:personalization')}
        </Flex>

        <Card mt={6} px={[3, 10]} py={[3, 7]} fontSize={'sm'}>
          <Flex alignItems={'center'} w={['85%', '350px']}>
            <Box flex={'0 0 80px'}>{t('account_individuation:language')}:&nbsp;</Box>
            <Box flex={'1 0 0'}>
              <I18nLngSelector />
            </Box>
          </Flex>
          <Flex mt={6} alignItems={'center'} w={['85%', '350px']}>
            <Box flex={'0 0 80px'}>{t('account_individuation:timezone')}:&nbsp;</Box>
            <TimezoneSelect
              value={userInfo?.timezone}
              onChange={(e) => {
                if (!userInfo) return;
                onclickSave({ ...userInfo, timezone: e });
              }}
            />
          </Flex>
        </Card>
      </Box>
    </AccountContainer>
  );
};

export async function getServerSideProps(content: any) {
  return {
    props: {
      ...(await serviceSideProps(content, ['account', 'account_individuation']))
    }
  };
}

export default Individuation;
