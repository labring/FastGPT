import AccountContainer from '../components/AccountContainer';
import { Box, Flex, Grid, Progress, useDisclosure } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useUserStore } from '@/web/support/user/useUserStore';
import { TeamMemberRoleEnum } from '@fastgpt/global/support/user/team/constant';
import dynamic from 'next/dynamic';
import { useState, useEffect, useCallback } from 'react';
import WorkflowVariableModal from './components/WorkflowVariableModal';
import axios from 'axios';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { serviceSideProps } from '@fastgpt/web/common/system/nextjs';

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
  value?: string;
  usage?: [number, number];
};

const ThirdParty = () => {
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();
  const { toast } = useToast();
  const { isOpen: isOpenLaf, onClose: onCloseLaf, onOpen: onOpenLaf } = useDisclosure();
  const { isOpen: isOpenOpenai, onClose: onCloseOpenai, onOpen: onOpenOpenai } = useDisclosure();

  const [workflowVariable, setWorkflowVariable] = useState<ThirdPartyAccountType>();

  const { userInfo } = useUserStore();

  const isOwner = userInfo?.team.role === TeamMemberRoleEnum.owner;

  const defaultAccountList: ThirdPartyAccountType[] = [
    {
      name: t('account_thirdParty:laf_account'),
      icon: 'support/account/laf',
      intro: t('common:support.user.Laf account intro'),
      onClick: onOpenLaf,
      isOpen: !!feConfigs?.lafEnv,
      value: userInfo?.team.lafAccount?.token
    },
    {
      name: t('account_thirdParty:openai_account_configuration'),
      iconColor: 'black',
      icon: 'common/openai',
      intro: t('account_thirdParty:open_api_notice'),
      onClick: onOpenOpenai,
      isOpen: feConfigs?.show_openai_account,
      value: userInfo?.team.openaiAccount?.key
    }
  ];
  const getWorkflowVariables = useCallback(async (): Promise<ThirdPartyAccountType[]> => {
    return Promise.all(
      (feConfigs?.externalProviderWorkflowVariables || []).map(async (item) => {
        const teamExternalWorkflowVariables = userInfo?.team.externalWorkflowVariables || {};

        const workflowVariable = teamExternalWorkflowVariables[item.key];

        const usage = await (async () => {
          if (!workflowVariable || !item.url) return [0, -1];
          try {
            const response = await axios.get(item.url, {
              headers: {
                Authorization: workflowVariable
              }
            });
            return response.data.usage;
          } catch (err) {
            console.log(err);
            return [0, -1];
          }
        })();

        const account = {
          key: item.key,
          name: item.name,
          value: workflowVariable,
          icon: 'common/variable',
          iconColor: 'primary.600',
          intro: item.intro || t('account_thirdParty:no_intro')
        };

        return {
          ...account,
          usage: usage || [0, -1],
          onClick: () => setWorkflowVariable(account),
          isOpen: item.isOpen
        };
      })
    );
  }, [feConfigs?.externalProviderWorkflowVariables, t, userInfo?.team.externalWorkflowVariables]);

  useEffect(() => {
    const loadWorkflowVariables = async () => {
      try {
        const variables = await getWorkflowVariables();
        setExternalWorkflowVariables(variables);
      } catch (err) {
        console.error('Failed to load workflow variables:', err);
      }
    };

    loadWorkflowVariables();
  }, [getWorkflowVariables]);

  const [externalWorkflowVariables, setExternalWorkflowVariables] = useState<
    ThirdPartyAccountType[]
  >([]);

  const accountList = [...defaultAccountList, ...externalWorkflowVariables];

  return (
    <AccountContainer>
      <Box px={[4, 8]} py={[4, 6]} bg={'white'} h={'full'}>
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
              <Box
                key={item.name}
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
                    color={!!item.value ? 'green.600' : 'myGray.700'}
                    bg={!!item.value ? 'green.50' : 'myGray.100'}
                    px={2}
                    py={1}
                    borderRadius={'sm'}
                    fontSize={'10px'}
                  >
                    {!!item.value
                      ? t('account_thirdParty:configured')
                      : t('account_thirdParty:not_configured')}
                  </Box>
                </Flex>
                <Box
                  mt={3}
                  fontSize={'mini'}
                  color={'myGray.500'}
                  lineHeight={'18px'}
                  maxHeight={'36px'}
                  overflow={'hidden'}
                  textOverflow={'ellipsis'}
                  display={'-webkit-box'}
                  sx={{
                    WebkitLineClamp: '2',
                    WebkitBoxOrient: 'vertical'
                  }}
                >
                  {item.intro}
                </Box>
                {item.usage && (
                  <Box position={'absolute'} bottom={0} w={'full'} pr={10}>
                    <Flex fontSize={'mini'} color={'myGray.500'}>
                      <Box>{t('account_thirdParty:usage')}</Box>
                      {item.value ? (
                        item.usage[1] > 0 ? (
                          <Box ml={1}>
                            {item.usage[0]}/{item.usage[1]}
                          </Box>
                        ) : (
                          <Box ml={1}>{t('account_thirdParty:unavailable')}</Box>
                        )
                      ) : (
                        <Box ml={1}>--</Box>
                      )}
                    </Flex>
                    <Box mt={1} mb={3} w={'full'}>
                      <Progress
                        size={'sm'}
                        value={(item.usage[0] / item.usage[1]) * 100}
                        colorScheme={'blue'}
                        borderRadius={'md'}
                        borderWidth={'1px'}
                        borderColor={'borderColor.low'}
                      />
                    </Box>
                  </Box>
                )}
              </Box>
            ))}
        </Grid>
      </Box>
      {isOpenLaf && userInfo && (
        <LafAccountModal defaultData={userInfo?.team.lafAccount} onClose={onCloseLaf} />
      )}
      {isOpenOpenai && userInfo && (
        <OpenAIAccountModal defaultData={userInfo?.team.openaiAccount} onClose={onCloseOpenai} />
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
