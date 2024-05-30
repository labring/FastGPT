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
  useToast
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
        <TableContainer>
          <Table>
            <Thead bg="myWhite.400">
              <Tr>
                <Th>协作者</Th>
                <Th>权限</Th>
                <Th>操作</Th>
              </Tr>
            </Thead>
            <Tbody>
              {collaboratorList?.map((collaborator) => {
                const teamMember = teamMemberList?.find(
                  (v) => v.tmbId.toString() === collaborator.tmbId.toString()
                );
                return (
                  <Tr key={collaborator.tmbId.toString()}>
                    <Th>{teamMember?.memberName}</Th>
                    <Th>
                      <PermissionTags permission={collaborator.permission} />
                    </Th>
                    <Th>
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
                    </Th>
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
