import { Box, Button, Flex, IconButton } from '@chakra-ui/react';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { TeamMemberRoleEnum } from '@fastgpt/global/support/user/team/constant';
import { defaultForm } from './components/EditInfoModal';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useContextSelector } from 'use-context-selector';
import { TeamModalContext } from './context';

function TeamList() {
  const { t } = useTranslation();
  const { userInfo } = useUserStore();
  const { myTeams, onSwitchTeam, setEditTeamData } = useContextSelector(TeamModalContext, (v) => v);

  return (
    <Flex
      flexDirection={'column'}
      w={['auto', '270px']}
      h={['auto', '100%']}
      pt={3}
      px={5}
      mb={[2, 0]}
    >
      <Flex
        alignItems={'center'}
        py={2}
        h={'40px'}
        borderBottom={'1.5px solid rgba(0, 0, 0, 0.05)'}
      >
        <Box flex={['0 0 auto', 1]} fontSize={['sm', 'md']} fontWeight={'bold'}>
          {t('common:common.Team')}
        </Box>
        {/* if there is no team */}
        {myTeams.length < 1 && (
          <IconButton
            variant={'ghost'}
            border={'none'}
            icon={
              <MyIcon
                name={'common/addCircleLight'}
                w={['16px', '18px']}
                color={'primary.500'}
                cursor={'pointer'}
              />
            }
            aria-label={''}
            onClick={() => setEditTeamData(defaultForm)}
          />
        )}
      </Flex>
      <Box flex={['auto', '1 0 0']} overflow={'auto'}>
        {myTeams.map((team) => (
          <Flex
            key={team.teamId}
            alignItems={'center'}
            mt={3}
            borderRadius={'md'}
            p={3}
            cursor={'default'}
            gap={3}
            {...(userInfo?.team?.teamId === team.teamId
              ? {
                  bg: 'primary.200'
                }
              : {
                  _hover: {
                    bg: 'myGray.100'
                  }
                })}
          >
            <Avatar src={team.avatar} w={['18px', '22px']} />
            <Box
              flex={'1 0 0'}
              w={0}
              fontSize={'sm'}
              {...(team.role === TeamMemberRoleEnum.owner
                ? {
                    fontWeight: 'bold'
                  }
                : {})}
            >
              {team.teamName}
            </Box>
            {userInfo?.team?.teamId === team.teamId ? (
              <MyIcon name={'common/tickFill'} w={'16px'} color={'primary.500'} />
            ) : (
              <Button
                size={'xs'}
                variant={'whitePrimary'}
                onClick={() => onSwitchTeam(team.teamId)}
              >
                {t('common:user.team.Check Team')}
              </Button>
            )}
          </Flex>
        ))}
      </Box>
    </Flex>
  );
}

export default TeamList;
