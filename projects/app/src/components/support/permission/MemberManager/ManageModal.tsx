import {
  Button,
  ModalBody,
  ModalFooter,
  Table,
  TableContainer,
  Tbody,
  Th,
  Thead,
  Tr,
  Td,
  useToast,
  Box
} from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import React, { useState } from 'react';
import { useContextSelector } from 'use-context-selector';
import { CollaboratorContext } from '.';
import PermissionSelect from './PermissionSelect';
import PermissionTags from './PermissionTags';

export type ManageModalProps = {
  onClose: () => void;
};

function ManageModal({ onClose }: ManageModalProps) {
  const {
    collaboratorList,
    teamMemberList,
    addCollaborators,
    refetchCollaboratorList,
    deleteCollaborator
  } = useContextSelector(CollaboratorContext, (v) => v);
  const toast = useToast();
  const [refresh, setRefresh] = useState<boolean>(false);
  return (
    <MyModal isOpen onClose={onClose} minW="600px" title="管理协作者" iconSrc="common/settingLight">
      <ModalBody>
        <TableContainer borderRadius="md" minH="400px">
          <Table>
            <Thead bg="myWhite.400">
              <Tr>
                <Th border="none">协作者</Th>
                <Th border="none">权限</Th>
                <Th border="none">操作</Th>
              </Tr>
            </Thead>
            <Tbody>
              {collaboratorList?.length === 0 && (
                <Tr>
                  <Td colSpan={3} border="none">
                    <Box textAlign="center" p={4}>
                      暂无协作者
                    </Box>
                  </Td>
                </Tr>
              )}
              {collaboratorList?.map((collaborator) => {
                const teamMember = teamMemberList?.find(
                  (v) => v.tmbId.toString() === collaborator.tmbId.toString()
                );
                return (
                  <Tr
                    key={collaborator.tmbId.toString()}
                    _hover={{
                      bg: 'myWhite.300'
                    }}
                  >
                    <Td border="none">{teamMember?.memberName}</Td>
                    <Td border="none">
                      <PermissionTags permission={collaborator.permission} />
                    </Td>
                    <Td border="none">
                      <PermissionSelect
                        iconButton
                        value={collaborator.permission}
                        onChange={(v) => {
                          if (v == collaborator.permission) return;
                          if (addCollaborators([collaborator.tmbId.toString()], v)) {
                            toast({
                              title: '修改成功',
                              status: 'success'
                            });
                          }
                        }}
                        deleteButton
                        onDelete={() => {
                          if (deleteCollaborator(collaborator.tmbId.toString())) {
                            toast({
                              title: '删除成功',
                              status: 'success'
                            });
                          }
                        }}
                      />
                    </Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>
        </TableContainer>
      </ModalBody>
      <ModalFooter>
        <Button onClick={onClose}>确认</Button>
      </ModalFooter>
    </MyModal>
  );
}

export default ManageModal;
