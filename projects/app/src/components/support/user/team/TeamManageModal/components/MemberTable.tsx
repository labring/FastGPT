import Avatar from '@fastgpt/web/components/common/Avatar';
import { Box, HStack, Table, TableContainer, Tbody, Td, Th, Thead, Tr } from '@chakra-ui/react';
import { TeamMemberRoleEnum } from '@fastgpt/global/support/user/team/constant';
import { useTranslation } from 'next-i18next';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { delRemoveMember } from '@/web/support/user/team/api';
import Tag from '@fastgpt/web/components/common/Tag';
import Icon from '@fastgpt/web/components/common/Icon';
import GroupTags from '@/components/support/permission/Group/GroupTags';
import { useContextSelector } from 'use-context-selector';
import { TeamModalContext } from '../context';

function MemberTable() {
  const { userInfo } = useUserStore();
  const { t } = useTranslation();

  const { ConfirmModal: ConfirmRemoveMemberModal, openConfirm: openRemoveMember } = useConfirm({
    type: 'delete'
  });

  const { members, groups, refetchMembers, refetchGroups } = useContextSelector(
    TeamModalContext,
    (v) => v
  );

  return (
    <MyBox>
      <TableContainer overflow={'unset'} fontSize={'sm'} mx="6">
        <Table overflow={'unset'}>
          <Thead>
            <Tr bgColor={'white !important'}>
              <Th borderLeftRadius="6px" bgColor="myGray.100">
                {t('common:common.Username')}
              </Th>
              <Th bgColor="myGray.100">{t('user:team.belong_to_group')}</Th>
              <Th borderRightRadius="6px" bgColor="myGray.100">
                {t('common:common.Action')}
              </Th>
            </Tr>
          </Thead>
          <Tbody>
            {members?.map((item) => (
              <Tr key={item.userId} overflow={'unset'}>
                <Td>
                  <HStack>
                    <Avatar src={item.avatar} w={['18px', '22px']} borderRadius={'50%'} />
                    <Box className={'textEllipsis'}>
                      {item.memberName}
                      {item.status === 'waiting' && (
                        <Tag ml="2" colorSchema="yellow">
                          {t('common:user.team.member.waiting')}
                        </Tag>
                      )}
                    </Box>
                  </HStack>
                </Td>
                <Td maxW={'300px'}>
                  <GroupTags
                    names={groups
                      ?.filter((group) => group.members.map((m) => m.tmbId).includes(item.tmbId))
                      .map((g) => g.name)}
                    max={3}
                  />
                </Td>
                <Td>
                  {userInfo?.team.permission.hasManagePer &&
                    item.role !== TeamMemberRoleEnum.owner &&
                    item.tmbId !== userInfo?.team.tmbId && (
                      <Icon
                        name={'common/trash'}
                        cursor={'pointer'}
                        w="1rem"
                        p="1"
                        borderRadius="sm"
                        _hover={{
                          color: 'red.600',
                          bgColor: 'myGray.100'
                        }}
                        onClick={() => {
                          openRemoveMember(
                            () =>
                              delRemoveMember(item.tmbId).then(() =>
                                Promise.all([refetchGroups(), refetchMembers()])
                              ),
                            undefined,
                            t('common:user.team.Remove Member Confirm Tip', {
                              username: item.memberName
                            })
                          )();
                        }}
                      />
                    )}
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>

        <ConfirmRemoveMemberModal />
      </TableContainer>
    </MyBox>
  );
}

export default MemberTable;
