import { serviceSideProps } from '@fastgpt/web/common/system/nextjs';
import AccountContainer from '../components/AccountContainer';
import { Box, Flex } from '@chakra-ui/react';
import Icon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import TeamSelector from '../components/TeamSelector';
import { useUserStore } from '@/web/support/user/useUserStore';
import React, { useMemo } from 'react';
import { useContextSelector } from 'use-context-selector';
import { useRouter } from 'next/router';
import FillRowTabs from '@fastgpt/web/components/common/Tabs/FillRowTabs';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { TeamMemberRoleEnum } from '@fastgpt/global/support/user/team/constant';
import { TeamContext, TeamModalContextProvider } from '@/pageComponents/account/team/context';
import dynamic from 'next/dynamic';

const MemberTable = dynamic(() => import('@/pageComponents/account/team/MemberTable'));
const PermissionManage = dynamic(
  () => import('@/pageComponents/account/team/PermissionManage/index')
);
const GroupManage = dynamic(() => import('@/pageComponents/account/team/GroupManage/index'));
const OrgManage = dynamic(() => import('@/pageComponents/account/team/OrgManage/index'));

export enum TeamTabEnum {
  member = 'member',
  org = 'org',
  group = 'group',
  permission = 'permission'
}

const Team = () => {
  const router = useRouter();
  const { teamTab = TeamTabEnum.member } = router.query as { teamTab: `${TeamTabEnum}` };

  const { t } = useTranslation();
  const { userInfo } = useUserStore();

  const { setEditTeamData, isLoading, teamSize } = useContextSelector(TeamContext, (v) => v);

  const Tabs = useMemo(
    () => (
      <FillRowTabs
        list={[
          { label: t('account_team:member'), value: TeamTabEnum.member },
          { label: t('account_team:org'), value: TeamTabEnum.org },
          { label: t('account_team:group'), value: TeamTabEnum.group },
          { label: t('account_team:permission'), value: TeamTabEnum.permission }
        ]}
        px={'1rem'}
        value={teamTab}
        onChange={(e) => {
          router.replace({
            query: {
              ...router.query,
              teamTab: e
            }
          });
        }}
      />
    ),
    [router, t, teamTab]
  );

  return (
    <AccountContainer isLoading={isLoading}>
      <Flex h={'100%'} flexDirection={'column'}>
        {/* header */}
        <Flex
          w={'100%'}
          h={'3.5rem'}
          px={'1.56rem'}
          py={'0.56rem'}
          borderBottom={'1px solid'}
          borderColor={'myGray.200'}
          bg={'myGray.25'}
          align={'center'}
          gap={6}
          justify={'space-between'}
        >
          <Flex align={'center'}>
            <Flex gap={2} color={'myGray.900'}>
              <Icon name="support/user/usersLight" w={'1.25rem'} h={'1.25rem'} />
              <Box fontWeight={'500'} fontSize={'1rem'}>
                {t('account:team')}
              </Box>
            </Flex>
            <Flex align={'center'} ml={6}>
              <TeamSelector height={'28px'} />
            </Flex>
            {userInfo?.team?.role === TeamMemberRoleEnum.owner && (
              <Flex align={'center'} justify={'center'} ml={2} p={'0.44rem'}>
                <MyIcon
                  name="edit"
                  w="18px"
                  cursor="pointer"
                  _hover={{
                    color: 'primary.500'
                  }}
                  onClick={() => {
                    if (!userInfo?.team) return;
                    setEditTeamData({
                      id: userInfo.team.teamId,
                      name: userInfo.team.teamName,
                      avatar: userInfo.team.avatar
                    });
                  }}
                />
              </Flex>
            )}
          </Flex>

          <Box
            float={'right'}
            color={'myGray.900'}
            h={'1.25rem'}
            px={'0.5rem'}
            py={'0.125rem'}
            fontSize={'0.75rem'}
            borderRadius={'1.25rem'}
            bg={'myGray.150'}
          >
            {t('account_team:total_team_members', { amount: teamSize })}
          </Box>
        </Flex>

        {/* table */}
        <Box
          py={'1.5rem'}
          px={'2rem'}
          flex={'1 0 0'}
          display={'flex'}
          flexDirection={'column'}
          overflow={'auto'}
        >
          {teamTab === TeamTabEnum.member && <MemberTable Tabs={Tabs} />}
          {teamTab === TeamTabEnum.org && <OrgManage Tabs={Tabs} />}
          {teamTab === TeamTabEnum.group && <GroupManage Tabs={Tabs} />}
          {teamTab === TeamTabEnum.permission && <PermissionManage Tabs={Tabs} />}
        </Box>
      </Flex>
    </AccountContainer>
  );
};

export async function getServerSideProps(content: any) {
  return {
    props: {
      ...(await serviceSideProps(content, ['account', 'account_team', 'user']))
    }
  };
}

const Render = () => {
  const { userInfo } = useUserStore();

  return !!userInfo?.team ? (
    <TeamModalContextProvider>
      <Team />
    </TeamModalContextProvider>
  ) : null;
};

export default React.memo(Render);
