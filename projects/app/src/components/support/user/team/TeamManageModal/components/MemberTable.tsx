import Avatar from '@/components/Avatar';
import MyIcon from '@fastgpt/web/components/common/Icon';
import {
  Box,
  HStack,
  MenuButton,
  Table,
  TableContainer,
  Tbody,
  Td,
  Th,
  Thead,
  Tr
} from '@chakra-ui/react';
import {
  TeamMemberRoleEnum,
  TeamMemberStatusMap
} from '@fastgpt/global/support/user/team/constant';
import { useTranslation } from 'next-i18next';
import { useContextSelector } from 'use-context-selector';
import { useUserStore } from '@/web/support/user/useUserStore';
import { TeamModalContext } from '../context';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import MyBox from '@fastgpt/web/components/common/MyBox';
import PermissionTags from '@/components/support/permission/PermissionTags';
import { TeamPermissionList } from '@fastgpt/global/support/permission/user/constant';
import PermissionSelect from '@/components/support/permission/MemberManager/PermissionSelect';
import { CollaboratorContext } from '@/components/support/permission/MemberManager/context';
import { delRemoveMember } from '@/web/support/user/team/api';

function MemberTable() {
  const { userInfo } = useUserStore();
  const { t } = useTranslation();
  const { members, refetchMembers } = useContextSelector(TeamModalContext, (v) => v);
  const { onUpdateCollaborators } = useContextSelector(CollaboratorContext, (v) => v);

  const { ConfirmModal: ConfirmRemoveMemberModal, openConfirm: openRemoveMember } = useConfirm({
    type: 'delete'
  });

  return (
    <MyBox>
      <TableContainer overflow={'unset'} fontSize={'sm'}>
        <Table overflow={'unset'}>
          <Thead bg={'myWhite.400'}>
            <Tr>
              <Th borderRadius={'none !important'}>{t('common.Username')}</Th>
              <Th>{t('common.Permission')}</Th>
              <Th>{t('common.Status')}</Th>
              <Th borderRadius={'none !important'}>{t('common.Action')}</Th>
            </Tr>
          </Thead>
          <Tbody>
            {members.map((item) => (
              <Tr key={item.userId} overflow={'unset'}>
                <Td>
                  <HStack>
                    <Avatar src={item.avatar} w={['18px', '22px']} />
                    <Box maxW={'150px'} className={'textEllipsis'}>
                      {item.memberName}
                    </Box>
                  </HStack>
                </Td>
                <Td>
                  <PermissionTags
                    permission={item.permission}
                    permissionList={TeamPermissionList}
                  />
                </Td>
                <Td color={TeamMemberStatusMap[item.status].color}>
                  {t(TeamMemberStatusMap[item.status]?.label || '')}
                </Td>
                <Td>
                  {userInfo?.team.permission.hasManagePer &&
                    item.role !== TeamMemberRoleEnum.owner &&
                    item.tmbId !== userInfo?.team.tmbId && (
                      <PermissionSelect
                        value={item.permission.value}
                        Button={
                          <MenuButton
                            _hover={{
                              color: 'primary.600'
                            }}
                            borderRadius={'md'}
                            px={2}
                            py={1}
                            lineHeight={1}
                          >
                            <MyIcon name={'edit'} cursor={'pointer'} w="1rem" />
                          </MenuButton>
                        }
                        onChange={(permission) => {
                          onUpdateCollaborators({
                            tmbIds: [item.tmbId],
                            permission
                          });
                        }}
                        onDelete={() => {
                          openRemoveMember(
                            () => delRemoveMember(item.tmbId).then(refetchMembers),
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
