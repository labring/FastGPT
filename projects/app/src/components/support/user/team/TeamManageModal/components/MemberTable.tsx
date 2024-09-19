import Avatar from '@fastgpt/web/components/common/Avatar';
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
  Tooltip,
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
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';

function MemberTable() {
  const { userInfo } = useUserStore();
  const { t } = useTranslation();
  const { members, refetchMembers, refetchClbs } = useContextSelector(TeamModalContext, (v) => v);
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
              <Th borderRadius={'none !important'}>{t('common:common.Username')}</Th>
              <Th>
                <Box>
                  {t('common:common.Permission')}
                  <QuestionTip label={t('common:common.Permission_tip')} ml="2" />
                </Box>
              </Th>
              <Th>{t('common:common.Status')}</Th>
              <Th borderRadius={'none !important'}>{t('common:common.Action')}</Th>
            </Tr>
          </Thead>
          <Tbody>
            {members.map((item) => (
              <Tr key={item.userId} overflow={'unset'}>
                <Td>
                  <HStack>
                    <Avatar src={item.avatar} w={['18px', '22px']} borderRadius={'50%'} />
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
                  {t(TeamMemberStatusMap[item.status]?.label || ('' as any))}
                </Td>
                <Td>
                  {userInfo?.team.permission.hasManagePer &&
                    item.role !== TeamMemberRoleEnum.owner &&
                    item.tmbId !== userInfo?.team.tmbId && (
                      <PermissionSelect
                        value={item.permission.value}
                        trigger={'hover'}
                        Button={
                          <MenuButton
                            _hover={{
                              color: 'primary.600'
                            }}
                            borderRadius={'md'}
                            lineHeight={1}
                          >
                            <MyIcon name={'edit'} cursor={'pointer'} w="1rem" />
                          </MenuButton>
                        }
                        onChange={(permission) => {
                          onUpdateCollaborators({
                            members: [item.tmbId],
                            permission
                          }).then(refetchClbs);
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
