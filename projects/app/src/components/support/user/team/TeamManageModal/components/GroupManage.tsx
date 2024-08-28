import Avatar from '@fastgpt/web/components/common/Avatar';
import { Box, HStack, Table, TableContainer, Tbody, Td, Th, Thead, Tr } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { useContextSelector } from 'use-context-selector';
import { TeamModalContext } from '../context';
import MyMenu from '@fastgpt/web/components/common/MyMenu';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { deleteGroup } from '@/web/support/user/team/group/api';

function MemberTable() {
  const { t } = useTranslation();
  const { userInfo } = useUserStore();

  const { ConfirmModal: ConfirmDeleteGroupModal, openConfirm: openDeleteGroupModal } = useConfirm({
    type: 'delete',
    content: t('user:team.group.delete_confirm')
  });

  const { groups, refetchGroups } = useContextSelector(TeamModalContext, (v) => v);

  const { runAsync: delDeleteGroup, loading: isLoadingDeleteGroup } = useRequest2(deleteGroup, {
    manual: true,
    onSuccess: refetchGroups
  });

  return (
    <MyBox isLoading={isLoadingDeleteGroup}>
      <TableContainer overflow={'unset'} fontSize={'sm'}>
        <Table overflow={'unset'}>
          <Thead bg={'myWhite.400'}>
            <Tr>
              <Th borderRadius={'none !important'}>{t('user:team.group.name')}</Th>
              <Th>{t('user:team.group.members')}</Th>
              <Th borderRadius={'none !important'}>{t('common:common.Action')}</Th>
            </Tr>
          </Thead>
          <Tbody>
            {groups?.map((item) => (
              <Tr key={item._id} overflow={'unset'}>
                <Td>
                  <HStack>
                    <Avatar src={item.avatar} w={['18px', '22px']} />
                    <Box maxW={'150px'} className={'textEllipsis'}>
                      {item.name}
                    </Box>
                  </HStack>
                </Td>
                <Td>
                  {item.members}
                  {/*TODO: member list*/}
                </Td>
                <Td>
                  {userInfo?.team.permission.hasManagePer && (
                    <MyMenu
                      Button={<MyIcon name={'edit'} cursor={'pointer'} w="1rem" />}
                      menuList={[
                        {
                          children: [
                            {
                              label: t('common:common.Edit'),
                              icon: 'edit',
                              onClick: () => {
                                console.log('edit');
                              }
                            },
                            {
                              label: t('common:common.Delete'),
                              icon: 'delete',
                              type: 'danger',
                              onClick: openDeleteGroupModal(() => delDeleteGroup(item._id))
                            }
                          ]
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
      <ConfirmDeleteGroupModal />
    </MyBox>
  );
}

export default MemberTable;
