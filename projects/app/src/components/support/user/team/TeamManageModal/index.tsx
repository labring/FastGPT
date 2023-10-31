import React, { useMemo } from 'react';
import MyModal from '@/components/MyModal';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { getTeamList } from '@/web/support/user/team/api';
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

const CreateModal = dynamic(() => import('./CreateModal'));

const TeamManageModal = ({ onClose }: { onClose: () => void }) => {
  const theme = useTheme();
  const { t } = useTranslation();

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

  const { userInfo } = useUserStore();
  const { isOpen: isOpenCreate, onOpen: onOpenCreate, onClose: onCloseCreate } = useDisclosure();

  const { data = [], refetch: refetchTeam } = useQuery(['getTeams'], () => getTeamList());

  const formatTeams = useMemo<TeamItemType[]>(() => [personalTeam, ...data], [data, personalTeam]);

  const activeTeam = useMemo(() => {
    return userInfo?.team || personalTeam;
  }, [personalTeam, userInfo?.team]);

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
        maxW={'1000px'}
        w={'100%'}
        h={'550px'}
        isCentered
        bg={'#eaeaeb'}
        overflow={'hidden'}
      >
        <Flex flex={1}>
          <Flex flexDirection={'column'} w={'270px'} h={'100%'} pt={3} px={5}>
            <Flex alignItems={'center'} py={2} borderBottom={'1.5px solid rgba(0, 0, 0, 0.05)'}>
              <Box flex={1} fontWeight={'bold'} fontSize={['md', 'lg']}>
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
                onClick={onOpenCreate}
              />
            </Flex>
            <Box flex={'1 0 0'} overflow={'auto'}>
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
                  <Box flex={'1 0 0'} w={0} className={'textEllipsis'} fontWeight={'bold'}>
                    {team.teamName}
                  </Box>
                  {activeTeam.teamId === team.teamId ? (
                    <MyIcon name={'common/tickFill'} w={'16px'} color={'myBlue.600'} />
                  ) : (
                    <Button size={'xs'} variant={'base'}>
                      {t('user.team.Check Team')}
                    </Button>
                  )}
                </Flex>
              ))}
            </Box>
          </Flex>
          <Flex
            flexDirection={'column'}
            flex={'1'}
            h={'100%'}
            bg={'white'}
            borderTopLeftRadius={'xl'}
            borderBottomLeftRadius={'xl'}
            p={5}
          >
            <Flex alignItems={'center'}>
              <Box fontSize={['lg', 'xl']} fontWeight={'bold'}>
                {activeTeam.teamName}
              </Box>
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
        </Flex>
      </MyModal>
      {isOpenCreate && (
        <CreateModal
          onClose={onCloseCreate}
          onSuccess={() => {
            refetchTeam();
          }}
        />
      )}
    </>
  );
};

export default React.memo(TeamManageModal);
