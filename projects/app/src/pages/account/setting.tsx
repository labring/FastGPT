'use client';
import { Box, Flex } from '@chakra-ui/react';
import React, { useCallback } from 'react';
import { useClientTranslation } from '@fastgpt/web/i18n/useClientTranslation';
import { useUserStore } from '@/web/support/user/useUserStore';
import { type UserType } from '@fastgpt/global/support/user/type';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useForm } from 'react-hook-form';
import { type UserUpdateParams } from '@/types/user';
import TimezoneSelect from '@fastgpt/web/components/common/MySelect/TimezoneSelect';
import I18nLngSelector from '@/components/Select/I18nLngSelector';
import AccountContainer from '@/pageComponents/account/AccountContainer';
import { accountPageRootStyles, accountTitleTextStyles } from '@/pageComponents/account/styles';

const Individuation = () => {
  const { t } = useClientTranslation(['account_setting', 'account']);
  const { userInfo, updateUserInfo } = useUserStore();
  const { toast } = useToast();

  const { reset } = useForm<UserUpdateParams>({
    defaultValues: userInfo!
  });

  const onclickSave = useCallback(
    async (data: UserType) => {
      await updateUserInfo({
        timezone: data.timezone
      });
      reset(data);
      toast({
        title: t('account_setting:update_data_success'),
        status: 'success'
      });
    },
    [reset, t, toast, updateUserInfo]
  );

  return (
    <AccountContainer>
      <Flex {...accountPageRootStyles} flexDirection={'column'}>
        <Flex
          display={['none', 'flex']}
          h={'64px'}
          flexShrink={0}
          px={[4, 6]}
          alignItems={'center'}
          borderBottom={'1px solid'}
          borderColor={'myGray.200'}
        >
          <Box as={'h1'} {...accountTitleTextStyles}>
            {t('account:language')}
          </Box>
        </Flex>
        <Box p={[4, 6]} fontSize={'sm'} overflowY={['visible', 'auto']}>
          <Flex alignItems={'center'} w={['100%', '350px']}>
            <Box flex={'0 0 80px'}>{t('account_setting:language')}:&nbsp;</Box>
            <Box flex={'1 0 0'}>
              <I18nLngSelector />
            </Box>
          </Flex>
          <Flex mt={6} alignItems={'center'} w={['100%', '350px']}>
            <Box flex={'0 0 80px'}>{t('account_setting:timezone')}:&nbsp;</Box>
            <Box flex={'1 0 0'}>
              <TimezoneSelect
                value={userInfo?.timezone}
                onChange={(e) => {
                  if (!userInfo) return;
                  onclickSave({ ...userInfo, timezone: e });
                }}
              />
            </Box>
          </Flex>
        </Box>
      </Flex>
    </AccountContainer>
  );
};

export default Individuation;
