import {
  Box,
  Button,
  ModalBody,
  ModalCloseButton,
  ModalFooter,
  Grid,
  Input,
  Flex
} from '@chakra-ui/react';
import Avatar from '@/components/Avatar';
import MyModal from '@fastgpt/web/components/common/MyModal';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useContextSelector } from 'use-context-selector';
import { TeamContext } from '.';
import {
  hasManage,
  constructPermission,
  PermissionList
} from '@fastgpt/service/support/permission/resourcePermission/permisson';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { updateMemberPermission } from '@/web/support/user/team/api';
import { useUserStore } from '@/web/support/user/useUserStore';

function AddManagerModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const { t } = useTranslation();
  const { userInfo } = useUserStore();
  const refetchMembers = useContextSelector(TeamContext, (v) => v.refetchMembers);
  const members = useContextSelector(TeamContext, (v) =>
    v.members.filter((member) => {
      return member.tmbId != userInfo!.team.tmbId && !hasManage(member.permission);
    })
  );
  const [selected, setSelected] = useState<typeof members>([]);

  const { mutate: submit } = useRequest({
    mutationFn: async () => {
      console.log(selected);
      return updateMemberPermission({
        teamId: userInfo!.team.teamId,
        permission: constructPermission([
          PermissionList['Read'],
          PermissionList['Write'],
          PermissionList['Manage']
        ]).value,
        memberIds: selected.map((item) => {
          return item.tmbId;
        })
      });
    },
    onSuccess: () => {
      refetchMembers();
      onSuccess();
    },
    successToast: '成功',
    errorToast: '失败'
  });
  return (
    <MyModal
      isOpen
      iconSrc="/imgs/modal/team.svg"
      maxW={['90vw', '900px']}
      overflow={'unset'}
      title={
        <Box>
          <Box>添加管理员</Box>
        </Box>
      }
    >
      <ModalCloseButton onClick={onClose} />
      <ModalBody>
        <Box mx="4">
          <Grid
            templateColumns="1fr 1fr"
            gap="2"
            // mx="auto"
          >
            <Flex flexDirection="column" border="sm" p="2">
              {/* WARN: Searching is not implemented */}
              <Input placeholder="查找用户" />
              <Flex flexDirection="column">
                {members.map((member) => {
                  return (
                    <Flex
                      p="1"
                      m="2"
                      flexDirection="row"
                      bg="myGray.50"
                      onClick={() => {
                        if (selected.indexOf(member) == -1) {
                          setSelected([...selected, member]);
                        }
                      }}
                    >
                      <Avatar src={member.avatar} w={['18px', '22px']} />
                      {member.memberName}
                    </Flex>
                  );
                })}
              </Flex>
            </Flex>
            <Flex flexDirection="column" border="sm" p="2">
              {selected.map((member) => {
                return (
                  <Flex
                    p="1"
                    m="2"
                    flexDirection="row"
                    bg="myGray.50"
                    onClick={() => {
                      setSelected([...selected.filter((item) => item.tmbId != member.tmbId)]);
                    }}
                  >
                    <Avatar src={member.avatar} w={['18px', '22px']} />
                    {member.memberName}
                  </Flex>
                );
              })}
            </Flex>
          </Grid>
        </Box>
      </ModalBody>
      <ModalFooter>
        <Button w={'100%'} h={'34px'} onClick={submit}>
          确定
        </Button>
      </ModalFooter>
    </MyModal>
  );
}

export default AddManagerModal;
