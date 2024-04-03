import React, { useMemo, useState } from 'react';
import {
  ModalBody,
  Box,
  Flex,
  Input,
  ModalFooter,
  Button,
  Link,
  Center,
  Spinner
} from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import { useForm } from 'react-hook-form';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import type { UserType } from '@fastgpt/global/support/user/type.d';
import { getLafApplications, pat2Token } from '@/web/support/laf/api';
import { useQuery } from '@tanstack/react-query';
import MySelect from '@fastgpt/web/components/common/MySelect';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { putUpdateTeam } from '@/web/support/user/team/api';
import { useUserStore } from '@/web/support/user/useUserStore';
import { lafAccount } from '@fastgpt/global/support/user/team/controller';

type TApp = {
  name: string;
  appid: string;
  state: string;
};

const LafAccountModal = ({
  defaultData,
  onClose
}: {
  defaultData: lafAccount;
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  const { register, handleSubmit, setValue, getValues, watch } = useForm({
    defaultValues: defaultData
  });
  const { feConfigs } = useSystemStore();
  const { toast } = useToast();
  const [pat, setPat] = useState('');
  const [token, setToken] = useState(getValues('token'));
  const { userInfo } = useUserStore();
  const lafEnv = feConfigs.lafEnv || '';

  const { mutate: pat2TokenMutate, isLoading: isPatLoading } = useRequest({
    mutationFn: async (pat) => {
      const { data } = await pat2Token(lafEnv, pat);
      const lafToken = data.data;
      setToken(lafToken);
      setValue('token', lafToken);
    },
    errorToast: t('plugin.Invalid Env')
  });

  const { data: appListData, isLoading: isAppListLoading } = useQuery(
    ['appList', token],
    () => {
      return getLafApplications(lafEnv, token);
    },
    {
      enabled: !!token,
      onSuccess: (data) => {},
      onError: (err) => {
        toast({
          title: '获取应用列表失败',
          status: 'error'
        });
        setToken('');
      }
    }
  );

  const { mutate: onSubmit, isLoading } = useRequest({
    mutationFn: async (data: any) => {
      if (!userInfo?.team.teamId) return;
      return putUpdateTeam({
        teamId: userInfo?.team.teamId || '',
        name: userInfo?.team.teamName || '',
        avatar: userInfo?.team.avatar || '',
        lafAccount: data
      });
    },
    onSuccess() {
      onClose();
    },
    successToast: t('common.Update Success'),
    errorToast: t('common.Update Failed')
  });
  return (
    <MyModal
      isOpen
      onClose={onClose}
      iconSrc="/imgs/module/laf.png"
      title={t('user.Laf Account Setting')}
    >
      <ModalBody>
        <Box fontSize={'sm'} color={'myGray.500'}>
          <Box>
            {t('user.laf intro')}
            <Link href={`https://doc.laf.run/zh/`} isExternal>
              {t('user.Learn More')}
            </Link>
          </Box>
          <Flex>
            {t('user.Current laf Env')}
            <Link ml={2} href={`https://${feConfigs.lafEnv}/`} isExternal>
              {`https://${feConfigs.lafEnv}/`}
            </Link>
          </Flex>
        </Box>
        {!token ? (
          <Flex alignItems={'center'} mt={5}>
            <Box flex={'0 0 65px'}>PAT:</Box>
            <Input
              flex={1}
              onChange={(e) => setPat(e.target.value)}
              placeholder={t('plugin.Enter PAT')}
            ></Input>
            <Button
              ml={2}
              flex={'0 0 65px'}
              variant={'whiteBase'}
              onClick={async () => {
                if (!pat) {
                  return toast({
                    title: 'pat is empty',
                    status: 'warning'
                  });
                }
                pat2TokenMutate(pat);
              }}
              isLoading={isPatLoading}
            >
              {t('common.Confirm')}
            </Button>
          </Flex>
        ) : isAppListLoading ? (
          <Center mt={5}>
            <Spinner color={'myGray.500'} />
          </Center>
        ) : (
          <Flex alignItems={'center'} mt={5}>
            <Box flex={'0 0 65px'}>{t('plugin.Currentapp')}</Box>
            <MySelect
              list={
                appListData?.data.data
                  .filter((app: TApp) => app.state === 'Running')
                  .map((app: TApp) => ({
                    label: `${app.name} (${app.appid})`,
                    value: app.appid
                  })) || []
              }
              placeholder={t('plugin.App')}
              value={watch('appid')}
              onchange={(e) => {
                setValue('appid', e);
              }}
              {...(register('appid'), { required: true })}
            />
            <Button
              variant={'link'}
              onClick={() => {
                setToken('');
                setValue('token', '');
              }}
              ml={4}
            >
              {t('user.Sign Out')}
            </Button>
          </Flex>
        )}
      </ModalBody>
      <ModalFooter>
        <Button mr={3} variant={'whiteBase'} onClick={onClose}>
          {t('common.Cancel')}
        </Button>
        <Button isLoading={isLoading} onClick={handleSubmit((data) => onSubmit(data))}>
          {t('common.Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default LafAccountModal;
