import { ModalBody, Table, TableContainer, Tbody, Th, Thead, Tr, Td, Flex } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import React from 'react';
import { useContextSelector } from 'use-context-selector';
import PermissionSelect from './PermissionSelect';
import PermissionTags from './PermissionTags';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { CollaboratorContext } from './context';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { PermissionValueType } from '@fastgpt/global/support/permission/type';
import { useUserStore } from '@/web/support/user/useUserStore';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import Loading from '@fastgpt/web/components/common/MyLoading';
import { useTranslation } from 'next-i18next';
export type ManageModalProps = {
  onClose: () => void;
};

function ManageModal({ onClose }: ManageModalProps) {
  const { t } = useTranslation();
  const { userInfo } = useUserStore();
  const { permission, collaboratorList, onUpdateCollaborators, onDelOneCollaborator } =
    useContextSelector(CollaboratorContext, (v) => v);

  const { runAsync: onDelete, loading: isDeleting } = useRequest2((tmbId: string) =>
    onDelOneCollaborator(tmbId)
  );

  const { runAsync: onUpdate, loading: isUpdating } = useRequest2(
    ({ tmbId, per }: { tmbId: string; per: PermissionValueType }) =>
      onUpdateCollaborators({
        members: [tmbId],
        permission: per
      }),
    {
      successToast: t('common.Update Success'),
      errorToast: 'Error'
    }
  );

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
                        <Avatar src={item.avatar} w="24px" mr={2} />
                        {item.name}
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
                            onChange={(per) => {
                              onUpdate({
                                tmbId: item.tmbId,
                                per
                              });
                            }}
                            onDelete={() => {
                              onDelete(item.tmbId);
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
