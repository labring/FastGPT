import Avatar from '@/components/Avatar';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { Box, MenuButton, Table, TableContainer, Tbody, Td, Th, Thead, Tr } from '@chakra-ui/react';
import {
  TeamMemberRoleEnum,
  TeamMemberRoleMap,
  TeamMemberStatusMap
} from '@fastgpt/global/support/user/team/constant';
import MyMenu from '@fastgpt/web/components/common/MyMenu';
import { useTranslation } from 'react-i18next';
import { useContextSelector } from 'use-context-selector';
import { TeamContext } from '.';
import { useUserStore } from '@/web/support/user/useUserStore';
import { hasManage } from '@fastgpt/service/support/permission/resourcePermission/permisson';

function MemberTable() {
  const members = useContextSelector(TeamContext, (v) => v.members);
  const openRemoveMember = useContextSelector(TeamContext, (v) => v.openRemoveMember);
  const onRemoveMember = useContextSelector(TeamContext, (v) => v.onRemoveMember);

  const { userInfo } = useUserStore();
  const { t } = useTranslation();

  return (
    <TableContainer overflow={'unset'}>
      <Table overflow={'unset'}>
        <Thead bg={'myWhite.400'}>
          <Tr>
            <Th>{t('common.Username')}</Th>
            <Th>{t('user.team.Role')}</Th>
            <Th>{t('common.Status')}</Th>
            <Th>{t('common.Action')}</Th>
          </Tr>
        </Thead>
        <Tbody>
          {members.map((item) => (
            <Tr key={item.userId} overflow={'unset'}>
              <Td display={'flex'} alignItems={'center'}>
                <Avatar src={item.avatar} w={['18px', '22px']} />
                <Box flex={'1 0 0'} w={0} ml={1} className={'textEllipsis'}>
                  {item.memberName}
                </Box>
              </Td>
              <Td>{t(TeamMemberRoleMap[item.role]?.label || '')}</Td>
              <Td color={TeamMemberStatusMap[item.status].color}>
                {t(TeamMemberStatusMap[item.status]?.label || '')}
              </Td>
              <Td>
                {hasManage(
                  members.find((item) => item.tmbId === userInfo?.team.tmbId)?.permission!
                ) &&
                  item.role !== TeamMemberRoleEnum.owner &&
                  item.tmbId !== userInfo?.team.tmbId && (
                    <MyMenu
                      width={20}
                      trigger="hover"
                      Button={
                        <MenuButton
                          _hover={{
                            bg: 'myWhite.600'
                          }}
                          borderRadius={'md'}
                          px={2}
                          py={1}
                          lineHeight={1}
                        >
                          <MyIcon
                            name={'edit'}
                            cursor={'pointer'}
                            w="14px"
                            _hover={{ color: 'primary.500' }}
                          />
                        </MenuButton>
                      }
                      menuList={[
                        {
                          label: t('user.team.Remove Member Tip'),
                          onClick: () =>
                            openRemoveMember(
                              () =>
                                onRemoveMember({
                                  teamId: item.teamId,
                                  memberId: item.tmbId
                                }),
                              undefined,
                              t('user.team.Remove Member Confirm Tip', {
                                username: item.memberName
                              })
                            )()
                        }
                      ]}
                    />
                  )}
              </Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
    </TableContainer>
  );
}

export default MemberTable;
