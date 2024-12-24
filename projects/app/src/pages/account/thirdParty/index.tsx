import AccountContainer from '../components/AccountContainer';
import { Box, Flex, Grid, Progress, useDisclosure } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useUserStore } from '@/web/support/user/useUserStore';
import { TeamMemberRoleEnum } from '@fastgpt/global/support/user/team/constant';
import dynamic from 'next/dynamic';
import { useState, useMemo } from 'react';
import WorkflowVariableModal from './components/WorkflowVariableModal';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { serviceSideProps } from '@fastgpt/web/common/system/nextjs';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { GET } from '@/web/common/api/request';
import type { checkUsageResponse } from '@/pages/api/support/user/team/thirtdParty/checkUsage';
import MyBox from '@fastgpt/web/components/common/MyBox';

const LafAccountModal = dynamic(() => import('@/components/support/laf/LafAccountModal'));
const OpenAIAccountModal = dynamic(() => import('./components/OpenAIAccountModal'));

export type ThirdPartyAccountType = {
  name: string;
  icon: string;
  iconColor?: string;
  key?: string;
  intro: string;
  onClick?: () => void;
  isOpen?: boolean;
  active: boolean;
  usage?: {
    used: number;
    total: number;
  };
};

const ThirdParty = () => {
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();
  const { toast } = useToast();
  const { isOpen: isOpenLaf, onClose: onCloseLaf, onOpen: onOpenLaf } = useDisclosure();
  const { isOpen: isOpenOpenai, onClose: onCloseOpenai, onOpen: onOpenOpenai } = useDisclosure();

  const [workflowVariable, setWorkflowVariable] = useState<ThirdPartyAccountType>();

  const { userInfo } = useUserStore();

  const isOwner = userInfo?.team?.role === TeamMemberRoleEnum.owner;

  const defaultAccountList: ThirdPartyAccountType[] = useMemo(
    () => [
      {
        name: t('account_thirdParty:laf_account'),
        icon: 'support/account/laf',
        intro: t('common:support.user.Laf account intro'),
        onClick: onOpenLaf,
        isOpen: !!feConfigs?.lafEnv,
        active: !!userInfo?.team?.lafAccount?.appid
      },
      {
        name: t('account_thirdParty:openai_account_configuration'),
        iconColor: 'black',
        icon: 'common/openai',
        intro: t('account_thirdParty:open_api_notice'),
        onClick: onOpenOpenai,
        isOpen: feConfigs?.show_openai_account,
        active: userInfo?.team?.openaiAccount?.key !== undefined
      }
    ],
    [
      feConfigs?.lafEnv,
      feConfigs?.show_openai_account,
      onOpenLaf,
      onOpenOpenai,
      t,
      userInfo?.team?.lafAccount?.appid,
      userInfo?.team?.openaiAccount?.key
    ]
  );

  const { data: workflowVariables = [], loading } = useRequest2(
    async (): Promise<ThirdPartyAccountType[]> => {
      return Promise.all(
        (feConfigs?.externalProviderWorkflowVariables || []).map(async (item) => {
          const usage = await (async () => {
            try {
              return await GET<checkUsageResponse>('/support/user/team/thirtdParty/checkUsage', {
                key: item.key
              });
            } catch (err) {
              return;
            }
          })();

          const account = {
            key: item.key,
            name: item.name,
            active: userInfo?.team?.externalWorkflowVariables?.[item.key] !== undefined,
            icon: 'common/variable',
            iconColor: 'primary.600',
            intro: item.intro || t('account_thirdParty:no_intro')
          };

          return {
            ...account,
            usage,
            onClick: () => setWorkflowVariable(account),
            isOpen: item.isOpen
          };
        })
      );
    },
    {
      manual: false,
      refreshDeps: [
        feConfigs?.externalProviderWorkflowVariables,
        userInfo?.team?.externalWorkflowVariables
      ]
    }
  );

  const accountList = useMemo(
    () => [...defaultAccountList, ...workflowVariables],
    [defaultAccountList, workflowVariables]
  );

  return (
    <AccountContainer>
      <MyBox isLoading={loading} px={[4, 8]} py={[4, 6]} bg={'white'} h={'full'}>
        <Flex>
          <MyIcon name={'common/thirdParty'} w={'24px'} color={'myGray.900'} />
          <Box ml={3}>
            <Box fontSize={'md'} color={'myGray.900'}>
              {t('account_thirdParty:third_party_account')}
            </Box>
            <Box fontSize={'mini'} color={'myGray.500'}>
              {t('account_thirdParty:third_party_account_desc')}
            </Box>
          </Box>
        </Flex>
        <Grid
          gridTemplateColumns={[
            '1fr',
            'repeat(2,1fr)',
            'repeat(3,1fr)',
            'repeat(3,1fr)',
            'repeat(4,1fr)'
          ]}
          gridGap={4}
          alignItems={'stretch'}
          mt={5}
          pb={5}
        >
          {accountList
            .filter((item) => item.isOpen)
            .map((item) => (
              <Flex
                key={item.name}
                flexDirection={'column'}
                border={'1px solid'}
                borderColor={'myGray.200'}
                pt={4}
                px={5}
                borderRadius={'10px'}
                h={'146px'}
                cursor={'pointer'}
                _hover={{
                  borderColor: 'primary.600'
                }}
                onClick={
                  isOwner
                    ? item.onClick
                    : () =>
                        toast({
                          title: t('account_thirdParty:error.no_permission'),
                          status: 'warning'
                        })
                }
                position={'relative'}
              >
                <Flex>
                  <MyIcon name={item.icon as any} w={'24px'} color={item.iconColor} />
                  <Box ml={2} flex={1} fontWeight={'medium'} fontSize={'16px'} color={'myGray.900'}>
                    {item.name}
                  </Box>
                  <Box
                    color={item.active ? 'green.600' : 'myGray.700'}
                    bg={item.active ? 'green.50' : 'myGray.100'}
                    px={2}
                    py={1}
                    borderRadius={'sm'}
                    fontSize={'10px'}
                  >
                    {item.active
                      ? t('account_thirdParty:configured')
                      : t('account_thirdParty:not_configured')}
                  </Box>
                </Flex>
                <Box
                  className="textEllipsis2"
                  mt={3}
                  fontSize={'mini'}
                  color={'myGray.500'}
                  lineHeight={'18px'}
                >
                  {item.intro}
                </Box>
                <Box flex={1} />
                {item.active && item.usage && (
                  <Box w={'full'} mb={4}>
                    <Flex fontSize={'mini'} color={'myGray.500'}>
                      <Box>{t('account_thirdParty:usage')}</Box>
                      {item.usage?.total ? (
                        <Box ml={1}>
                          {item.usage.used}/{item.usage.total}
                        </Box>
                      ) : (
                        <Box ml={1}>{t('account_thirdParty:unavailable')}</Box>
                      )}
                    </Flex>
                    <Box mt={1} w={'full'}>
                      <Progress
                        size={'sm'}
                        value={(item.usage.used / item.usage.total) * 100}
                        colorScheme={'blue'}
                        borderRadius={'md'}
                        borderWidth={'1px'}
                        borderColor={'low'}
                        isAnimated
                        hasStripe
                      />
                    </Box>
                  </Box>
                )}
              </Flex>
            ))}
        </Grid>
      </MyBox>

      {isOpenLaf && userInfo && (
        <LafAccountModal defaultData={userInfo?.team?.lafAccount} onClose={onCloseLaf} />
      )}
      {isOpenOpenai && userInfo && (
        <OpenAIAccountModal defaultData={userInfo?.team?.openaiAccount} onClose={onCloseOpenai} />
      )}
      {workflowVariable && (
        <WorkflowVariableModal
          defaultData={workflowVariable}
          onClose={() => setWorkflowVariable(undefined)}
        />
      )}
    </AccountContainer>
  );
};

export async function getServerSideProps(content: any) {
  return {
    props: {
      ...(await serviceSideProps(content, ['account', 'account_thirdParty']))
    }
  };
}

export default ThirdParty;
