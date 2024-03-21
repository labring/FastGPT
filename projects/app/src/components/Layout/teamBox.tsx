import { useMemo } from 'react';
import { useRouter } from 'next/router';
import { Flex, Menu, MenuButton, Box, MenuList, MenuItem } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import { useUserStore } from '@/web/support/user/useUserStore';
import MyCloseBox from '../common/MyCloseBox';
import { useQuery } from '@tanstack/react-query';
import { getTeamList, putSwitchTeam } from '@/web/support/user/team/api';
import { TeamMemberStatusEnum } from '@fastgpt/global/support/user/team/constant';
import { useRequest } from '@/web/common/hooks/useRequest';
import { setToken } from '@/web/support/user/auth';

const TeamBox = () => {
  const router = useRouter();
  const { t } = useTranslation();
  const { userInfo, initUserInfo } = useUserStore();

  const {
    data: myTeams = [],
    isFetching: isLoadingTeams,
    refetch: refetchTeam
  } = useQuery(['getTeams', userInfo?._id], () => getTeamList(TeamMemberStatusEnum.active));
  const defaultTeam = useMemo(
    () => myTeams.find((item) => item.defaultTeam) || myTeams[0],
    [myTeams]
  );

  const { mutate: onSwitchTeam, isLoading: isSwitchTeam } = useRequest({
    mutationFn: async (teamId: string) => {
      const token = await putSwitchTeam(teamId);
      setToken(token);
      return initUserInfo();
    },
    onSuccess: () => {
      router.reload();
    },
    errorToast: t('user.team.Switch Team Failed')
  });

  return (
    <MyCloseBox
      title={`${t('user.BelongTeam')}:`}
      pos={'fixed'}
      alignItems={'center'}
      bottom={'60px'}
      right={'40px'}
      bg={'#e6fffa'}
      p={4}
      zIndex={99999}
      borderRadius={'md'}
    >
      <Flex minW={120}>
        {userInfo?.team ? (
          <Menu>
            <MenuButton>
              <Flex cursor="pointer">
                <MyIcon name={'common/team'} width={'26px'} height={'26px'} />
                <Box ml={2}>{userInfo?.team.teamName}</Box>
              </Flex>
            </MenuButton>
            <MenuList>
              {myTeams.map((team) => (
                <MenuItem key={team.teamId} onClick={() => onSwitchTeam(team.teamId)}>
                  {team.teamName}
                </MenuItem>
              ))}
            </MenuList>
          </Menu>
        ) : (
          <>
            <Box w={'8px'} h={'8px'} mr={3} borderRadius={'50%'} bg={'#67c13b'} />
            {t('user.team.Personal Team')}
          </>
        )}
      </Flex>
    </MyCloseBox>
  );
};

export default TeamBox;
