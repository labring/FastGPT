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
      <TableContainer overflow={'unset'} fontSize={'sm'}>
        <Table overflow={'unset'}>
          <Thead bg={'myWhite.400'}>
            <Tr>
              <Th borderRadius={'none !important'}>{t('common:common.Username')}</Th>
              <Th>{t('user:team.belong_to_group')}</Th>
              <Th borderRadius={'none !important'}>{t('common:common.Action')}</Th>
            </Tr>
          </Thead>
          <Tbody>
            {members?.map((item) => (
              <Tr key={item.userId} overflow={'unset'}>
                <Td>
                  <HStack>
                    <Avatar src={item.avatar} w={['18px', '22px']} borderRadius={'50%'} />
                    <Box maxW={'150px'} className={'textEllipsis'}>
                      {item.memberName}
                      {item.status === 'waiting' && (
                        <Tag ml="2" colorSchema="yellow">
                          {t('user.team.member.waiting')}
                        </Tag>
                      )}
                    </Box>
                  </HStack>
                </Td>
                <Td>
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
                        onClick={() => {
                          openRemoveMember(
                            () =>
                              delRemoveMember(item.tmbId).then(() =>
                                Promise.all([refetchGroups, refetchMembers])
                              ),
                            undefined,
                            t('user.team.Remove Member Confirm Tip', {
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
