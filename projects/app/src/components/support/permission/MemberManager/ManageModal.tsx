import { useUserStore } from '@/web/support/user/useUserStore';
import { Flex, ModalBody, Table, TableContainer, Tbody, Td, Th, Thead, Tr } from '@chakra-ui/react';
import type { RequireOnlyOne } from '@fastgpt/global/common/type/utils';
import { DefaultGroupName } from '@fastgpt/global/support/user/team/group/constant';
import Avatar from '@fastgpt/web/components/common/Avatar';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import MyIcon from '@fastgpt/web/components/common/Icon';
import Loading from '@fastgpt/web/components/common/MyLoading';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useTranslation } from 'next-i18next';
import React from 'react';
import { useContextSelector } from 'use-context-selector';
import PermissionSelect from './PermissionSelect';
import PermissionTags from './PermissionTags';
import { CollaboratorContext } from './context';
export type ManageModalProps = {
  onClose: () => void;
};

function ManageModal({ onClose }: ManageModalProps) {
  const { t } = useTranslation();
  const { userInfo } = useUserStore();
  const { permission, collaboratorList, onUpdateCollaborators, onDelOneCollaborator } =
    useContextSelector(CollaboratorContext, (v) => v);

  const { runAsync: onDelete, loading: isDeleting } = useRequest2(onDelOneCollaborator);

  const { runAsync: onUpdate, loading: isUpdating } = useRequest2(onUpdateCollaborators, {
    successToast: t('common.Update Success'),
    errorToast: 'Error'
  });

  const loading = isDeleting || isUpdating;

  return (
    <MyModal
      isOpen
      onClose={onClose}
      minW="600px"
      title={t('user:team.manage_collaborators')}
      iconSrc="common/settingLight"
    >
      <ModalBody>
        <TableContainer borderRadius="md" minH="400px">
          <Table>
            <Thead bg="myGray.100">
              <Tr>
                <Th border="none">{t('user:name')}</Th>
                <Th border="none">{t('user:permissions')}</Th>
                <Th border="none" w={'40px'}>
                  {t('user:operations')}
                </Th>
              </Tr>
            </Thead>
            <Tbody>
              <Tr h={'10px'} />
              {collaboratorList?.map((item) => {
                return (
                  <Tr
                    key={item.tmbId}
                    _hover={{
                      bg: 'myGray.50'
                    }}
                  >
                    <Td border="none">
                      <Flex alignItems="center">
                        <Avatar src={item.avatar} rounded={'50%'} w="24px" mr={2} />
                        {item.name === DefaultGroupName ? userInfo?.team.teamName : item.name}
                      </Flex>
                    </Td>
                    <Td border="none">
                      <PermissionTags permission={item.permission.value} />
                    </Td>
                    <Td border="none">
                      {/* Not self; Not owner and other manager */}
                      {item.tmbId !== userInfo?.team?.tmbId &&
                        (permission.isOwner || !item.permission.hasManagePer) && (
                          <PermissionSelect
                            Button={
                              <MyIcon name={'edit'} w={'16px'} _hover={{ color: 'primary.600' }} />
                            }
                            value={item.permission.value}
                            onChange={(permission) => {
                              onUpdate({
                                members: item.tmbId ? [item.tmbId] : undefined,
                                groups: item.groupId ? [item.groupId] : undefined,
                                orgs: item.orgId ? [item.orgId] : undefined,
                                permission
                              });
                            }}
                            onDelete={() => {
                              onDelete({
                                tmbId: item.tmbId,
                                groupId: item.groupId,
                                orgId: item.orgId
                              } as RequireOnlyOne<{
                                tmbId: string;
                                groupId: string;
                                orgId: string;
                              }>);
                            }}
                          />
                        )}
                    </Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>
          {collaboratorList?.length === 0 && <EmptyTip text={t('user:team.no_collaborators')} />}
        </TableContainer>
        {loading && <Loading fixed={false} />}
      </ModalBody>
    </MyModal>
  );
}

export default ManageModal;
