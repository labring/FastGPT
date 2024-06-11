import {
  ModalBody,
  Table,
  TableContainer,
  Tbody,
  Th,
  Thead,
  Tr,
  Td,
  Box,
  Flex
} from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import React from 'react';
import { useContextSelector } from 'use-context-selector';
import PermissionSelect from './PermissionSelect';
import PermissionTags from './PermissionTags';
import Avatar from '@/components/Avatar';
import { CollaboratorContext } from './context';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useRequest, useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { PermissionValueType } from '@fastgpt/global/support/permission/type';
import { useUserStore } from '@/web/support/user/useUserStore';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import Loading from '@fastgpt/web/components/common/MyLoading';

export type ManageModalProps = {
  onClose: () => void;
};

function ManageModal({ onClose }: ManageModalProps) {
  const { userInfo } = useUserStore();
  const { permission, collaboratorList, onUpdateCollaborators, onDelOneCollaborator } =
    useContextSelector(CollaboratorContext, (v) => v);

  const { runAsync: onDelete, loading: isDeleting } = useRequest2((tmbId: string) =>
    onDelOneCollaborator(tmbId)
  );

  const { mutate: onUpdate, isLoading: isUpdating } = useRequest({
    mutationFn: ({ tmbId, per }: { tmbId: string; per: PermissionValueType }) => {
      return onUpdateCollaborators({
        tmbIds: [tmbId],
        permission: per
      });
    },
    successToast: '更新成功',
    errorToast: 'Error'
  });

  const loading = isDeleting || isUpdating;

  return (
    <MyModal isOpen onClose={onClose} minW="600px" title="管理协作者" iconSrc="common/settingLight">
      <ModalBody>
        <TableContainer borderRadius="md" minH="400px">
          <Table>
            <Thead bg="myGray.100">
              <Tr>
                <Th border="none">名称</Th>
                <Th border="none">权限</Th>
                <Th border="none" w={'40px'}>
                  操作
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
          {collaboratorList?.length === 0 && <EmptyTip text={'暂无协作者'} />}
        </TableContainer>
        {loading && <Loading fixed={false} />}
      </ModalBody>
    </MyModal>
  );
}

export default ManageModal;
