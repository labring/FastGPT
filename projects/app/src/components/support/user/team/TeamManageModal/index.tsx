import React, { useCallback, useMemo, useState } from 'react';
import MyModal from '@/components/MyModal';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { getTeamList, putSwitchTeam } from '@/web/support/user/team/api';
import {
  Box,
  Button,
  Flex,
  IconButton,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  TableContainer,
  useTheme,
  useDisclosure,
  ModalBody
} from '@chakra-ui/react';
import MyIcon from '@/components/Icon';
import Avatar from '@/components/Avatar';
import { TeamItemType, TeamMemberItemType } from '@fastgpt/global/support/user/team/type';
import { useUserStore } from '@/web/support/user/useUserStore';
import {
  TeamMemberRoleEnum,
  TeamMemberRoleMap,
  TeamMemberStatusEnum
} from '@fastgpt/global/support/user/team/constant';
import MySelect from '@/components/Select';
import MyTooltip from '@/components/MyTooltip';
import { useSelectFile } from '@/web/common/file/hooks/useSelectFile';
import dynamic from 'next/dynamic';
import { useRequest } from '@/web/common/hooks/useRequest';
import { setToken } from '@/web/support/user/auth';
import { useLoading } from '@/web/common/hooks/useLoading';
import { FormDataType, defaultForm } from './EditModal';

const EditModal = dynamic(() => import('./EditModal'));

const TeamManageModal = ({ onClose }: { onClose: () => void }) => {
  const theme = useTheme();
  const { t } = useTranslation();
  const { Loading } = useLoading();

  const personalTeam = useMemo(
    () => ({
      teamId: 'personal',
      teamName: t('user.team.Personal Team'),
      avatar: '/icon/logo.svg',
      balance: 999,
      teamMemberId: '',
      memberName: t('user.team.Personal Team'),
      role: TeamMemberRoleEnum.owner,
      status: TeamMemberStatusEnum.active
    }),
    [t]
  );

  const { userInfo, initUserInfo } = useUserStore();
  const [editTeamData, setEditTeamData] = useState<FormDataType>();

  const {
    data = [],
    isLoading: isLoadingTeams,
    refetch: refetchTeam
  } = useQuery(['getTeams'], () => getTeamList());
  const formatTeams = useMemo<TeamItemType[]>(() => [personalTeam, ...data], [data, personalTeam]);

  /* current select team */
  const activeTeam = useMemo(() => {
    return userInfo?.team || personalTeam;
  }, [personalTeam, userInfo?.team]);

  const { mutate: onSwitchTeam, isLoading: isSwitchTeam } = useRequest({
    mutationFn: async (tmbId: string) => {
      const token = await putSwitchTeam(tmbId);
      setToken(token);
      return initUserInfo();
    },
    errorToast: t('user.team.Switch Team Failed')
  });

  const { data: members = [] } = useQuery(['getMembers', activeTeam.teamId], () => {
    if (activeTeam.teamId === personalTeam.teamId) {
      return [
        {
          userId: userInfo?._id || '',
          teamMemberId: personalTeam.teamId,
          teamId: personalTeam.teamId,
          name: userInfo?.username || '',
          avatar: userInfo?.avatar || '',
          role: 'owner',
          status: 'active'
        }
      ] as TeamMemberItemType[];
    }
    return [];
  });

  return (
    <>
      <MyModal
        isOpen
        onClose={onClose}
        maxW={['90vw', '1000px']}
        w={'100%'}
        h={'550px'}
        isCentered
        bg={'myWhite.600'}
        overflow={'hidden'}
      >
        <Box display={['block', 'flex']} flex={1} position={'relative'} overflow={'auto'}>
          {/* teams */}
          <Flex
            flexDirection={'column'}
            w={['auto', '270px']}
            h={['auto', '100%']}
            pt={3}
            px={5}
            mb={[2, 0]}
          >
            <Flex alignItems={'center'} py={2} borderBottom={'1.5px solid rgba(0, 0, 0, 0.05)'}>
              <Box flex={['0 0 auto', 1]} fontWeight={'bold'} fontSize={['md', 'lg']}>
                {t('common.Team')}
              </Box>
              <IconButton
                variant={'ghost'}
                border={'none'}
                icon={
                  <MyIcon
                    name={'addCircle'}
                    w={['16px', '18px']}
                    color={'myBlue.600'}
                    cursor={'pointer'}
                  />
                }
                aria-label={''}
                onClick={() => setEditTeamData(defaultForm)}
              />
            </Flex>
            <Box flex={['auto', '1 0 0']} overflow={'auto'}>
              {formatTeams.map((team) => (
                <Flex
                  key={team.teamId}
                  alignItems={'center'}
                  mt={3}
                  borderRadius={'md'}
                  p={3}
                  cursor={'default'}
                  gap={3}
                  {...(activeTeam.teamId === team.teamId
                    ? {
                        bg: 'myGray.200'
                      }
                    : {
                        _hover: {
                          bg: 'myGray.100'
                        }
                      })}
                >
                  <Avatar src={team.avatar} w={['18px', '22px']} />
                  <Box flex={'1 0 0'} w={0} fontWeight={'bold'}>
                    {team.teamName}
                  </Box>
                  {activeTeam.teamId === team.teamId ? (
                    <MyIcon name={'common/tickFill'} w={'16px'} color={'myBlue.600'} />
                  ) : (
                    <Button
                      size={'xs'}
                      variant={'base'}
                      onClick={() => onSwitchTeam(team.teamMemberId)}
                    >
                      {t('user.team.Check Team')}
                    </Button>
                  )}
                </Flex>
              ))}
            </Box>
          </Flex>
          {/* team card */}
          <Flex
            flexDirection={'column'}
            flex={'1'}
            h={['auto', '100%']}
            bg={'white'}
            minH={['50vh', 'auto']}
            borderRadius={['8px 8px 0 0', '8px 0 0 8px']}
            p={5}
          >
            <Flex alignItems={'center'}>
              <Box fontSize={['lg', 'xl']} fontWeight={'bold'}>
                {activeTeam.teamName}
              </Box>
              <MyIcon
                name="edit"
                w={'14px'}
                ml={2}
                cursor={'pointer'}
                _hover={{
                  color: 'myBlue.600'
                }}
                onClick={() => {
                  setEditTeamData({
                    id: activeTeam.teamId,
                    name: activeTeam.teamName,
                    avatar: activeTeam.avatar
                  });
                }}
              />
            </Flex>
            <Box h={'2px'} w={'100%'} bg={'myGray.100'} my={3} />
            <Flex alignItems={'center'}>
              <MyIcon name="support/team/memberLight" w={'14px'} />
              <Box ml={1}>{t('user.team.Member')}</Box>
              <Box ml={2} bg={'myGray.100'} borderRadius={'20px'} px={3} fontSize={'xs'}>
                {members.length}
              </Box>
              {activeTeam.teamId !== personalTeam.teamId && (
                <Button
                  variant={'base'}
                  size="sm"
                  borderRadius={'md'}
                  ml={3}
                  leftIcon={<MyIcon name={'common/inviteLight'} w={'14px'} color={'myBlue.600'} />}
                >
                  {t('user.team.Invite Member')}
                </Button>
              )}
            </Flex>
            <Box mt={3} flex={'1 0 0'} overflow={'auto'}>
              <TableContainer>
                <Table>
                  <Thead bg={'myWhite.400'}>
                    <Tr>
                      <Th>{t('common.Username')}</Th>
                      <Th>{t('user.team.Role')}</Th>
                      <Th>{t('common.Status')}</Th>
                      <Th></Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {members.map((item) => (
                      <Tr key={item.userId}>
                        <Td display={'flex'} alignItems={'center'}>
                          <Avatar src={item.avatar} w={['18px', '22px']} />
                          <Box flex={'1 0 0'} w={0} ml={1} className={'textEllipsis'}>
                            {item.name}
                          </Box>
                        </Td>
                        <Td>
                          {item.role === TeamMemberRoleEnum.owner ? (
                            t('user.team.role.owner')
                          ) : (
                            <MySelect list={Object.values(TeamMemberRoleMap)} value={item.role} />
                          )}
                        </Td>
                        <Td color={item.status === 'active' ? 'green.500' : 'orange.500'}>
                          {item.status === 'active' ? '已加入' : '待接收'}
                        </Td>
                        <Td></Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </TableContainer>
            </Box>
          </Flex>
          <Loading loading={isSwitchTeam || isLoadingTeams} fixed={false} />
        </Box>
      </MyModal>
      {!!editTeamData && (
        <EditModal
          defaultData={editTeamData}
          onClose={() => setEditTeamData(undefined)}
          onSuccess={() => {
            refetchTeam();
          }}
        />
      )}
    </>
  );
};

export default React.memo(TeamManageModal);
