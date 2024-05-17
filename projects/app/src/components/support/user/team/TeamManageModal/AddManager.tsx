import {
  Box,
  Button,
  ModalBody,
  ModalCloseButton,
  ModalFooter,
  Grid,
  Input,
  Flex,
  Checkbox,
  CloseButton,
  InputGroup,
  InputLeftElement
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
import MyIcon from '@fastgpt/web/components/common/Icon';

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
  const [search, setSearch] = useState<string>('');
  const [searched, setSearched] = useState<typeof members>(members);

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
      maxW={['90vw']}
      minW={['900px']}
      overflow={'unset'}
      title={
        <Box>
          <Box>添加管理员</Box>
        </Box>
      }
    >
      <ModalCloseButton onClick={onClose} />
      <ModalBody>
        <Grid
          templateColumns="1fr 1fr"
          minH="400px"
          borderRadius="8px"
          border="1px solid"
          borderColor="myGray.200"
        >
          <Flex flexDirection="column" p="4">
            <InputGroup alignItems="center" h="32px" my="2" py="1">
              <InputLeftElement>
                <MyIcon name="common/searchLight" w="16px" />
              </InputLeftElement>
              <Input
                placeholder="搜索用户名"
                fontSize="lg"
                bg={'myGray.50'}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setSearched(
                    members.filter((member) => member.memberName.includes(e.target.value))
                  );
                }}
              />
            </InputGroup>
            <Flex flexDirection="column">
              {searched.map((member) => {
                return (
                  <Flex
                    p="1"
                    m="2"
                    flexDirection="row"
                    fontSize="lg"
                    alignItems="center"
                    key={member.memberName}
                  >
                    <Checkbox
                      isChecked={selected.includes(member)}
                      size="lg"
                      onChange={(e) => {
                        e.stopPropagation();
                        if (selected.indexOf(member) == -1) {
                          setSelected([...selected, member]);
                        } else {
                          setSelected([...selected.filter((item) => item.tmbId != member.tmbId)]);
                        }
                      }}
                    />
                    <Avatar src={member.avatar} w="24px" />
                    {member.memberName}
                  </Flex>
                );
              })}
            </Flex>
          </Flex>
          <Flex borderLeft="1px" borderColor="myGray.200" flexDirection="column" p="4">
            <Box fontSize="sm">已选: {selected.length} 个</Box>
            {selected.map((member) => {
              return (
                <Flex
                  p="2"
                  flexDirection="row"
                  alignItems="center"
                  justifyContent="space-between"
                  key={member.memberName}
                >
                  <Avatar src={member.avatar} w="24px" />
                  <Box w="full" fontSize="lg">
                    {member.memberName}
                  </Box>
                  <CloseButton
                    onClick={() =>
                      setSelected([...selected.filter((item) => item.tmbId != member.tmbId)])
                    }
                  />
                </Flex>
              );
            })}
          </Flex>
        </Grid>
      </ModalBody>
      <ModalFooter alignItems="flex-end">
        <Button h={'30px'} onClick={submit}>
          确定
        </Button>
      </ModalFooter>
    </MyModal>
  );
}

export default AddManagerModal;
