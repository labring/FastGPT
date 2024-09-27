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
        title: t('common:dataset.data.Update Success Tip'),
        status: 'success'
      });
    },
    [reset, t, toast, updateUserInfo]
  );

  return (
    <Box py={[3, '28px']} px={['5vw', '64px']}>
      <Flex alignItems={'center'} fontSize={'lg'} h={'30px'}>
        <MyIcon mr={2} name={'support/user/individuation'} w={'20px'} />
        {t('common:support.account.Individuation')}
      </Flex>

      <Card mt={6} px={[3, 10]} py={[3, 7]} fontSize={'sm'}>
        <Flex alignItems={'center'} w={['85%', '350px']}>
          <Box flex={'0 0 80px'}>{t('common:user.Language')}:&nbsp;</Box>
          <Box flex={'1 0 0'}>
            <I18nLngSelector />
          </Box>
        </Flex>
        <Flex mt={6} alignItems={'center'} w={['85%', '350px']}>
          <Box flex={'0 0 80px'}>{t('common:user.Timezone')}:&nbsp;</Box>
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
  );
};

export default Individuation;
