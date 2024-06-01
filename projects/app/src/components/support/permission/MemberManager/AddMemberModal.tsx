import {
  Flex,
  Box,
  Grid,
  ModalBody,
  InputGroup,
  InputLeftElement,
  Input,
  Checkbox,
  ModalFooter,
  Button,
  useToast
} from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useContextSelector } from 'use-context-selector';
import { CollaboratorContext } from '.';
import MyAvatar from '@/components/Avatar';
import { useState } from 'react';
import PermissionSelect from './PermissionSelect';
import PermissionTags from './PermissionTags';

export type AddModalPropsType = {
  onClose: () => void;
};

export function AddMemberModal({ onClose }: AddModalPropsType) {
  const { teamMemberList, permissionConfig, collaboratorList, addCollaborators } =
    useContextSelector(CollaboratorContext, (v) => v);
  const [searchText, setSearchText] = useState<string>('');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const toast = useToast();

  const [selectedPermission, setSelectedPermission] = useState<number>(permissionConfig[0].value);

  return (
    <MyModal
      isOpen
      onClose={onClose}
      iconSrc="support/permission/collaborator"
      title="添加协作者"
      minW="800px"
    >
      <ModalBody>
        <Grid
          minH="400px"
          border="1px solid"
          borderColor="myGray.200"
          mt="6"
          mx="8"
          borderRadius="0.5rem"
          templateColumns="55% 45%"
        >
          <Flex
            flexDirection="column"
            borderRight="1px solid"
            borderColor="myGray.200"
            p="4"
            minH="200px"
          >
            <InputGroup alignItems="center" h="32px" my="2" py="1">
              <InputLeftElement>
                <MyIcon name="common/searchLight" w="16px" color={'myGray.500'} />
              </InputLeftElement>
              <Input
                placeholder="搜索用户名"
                fontSize="lg"
                bgColor="myGray.50"
                onChange={(e) => setSearchText(e.target.value)}
              />
            </InputGroup>
            <Flex flexDirection="column" mt="2">
              {teamMemberList
                ?.filter((member) => {
                  return member.memberName.includes(searchText); // search filter
                })
                ?.map((member) => {
                  const change = () => {
                    if (selectedMembers.includes(member.tmbId)) {
                      setSelectedMembers(selectedMembers.filter((v) => v !== member.tmbId));
                    } else {
                      setSelectedMembers([...selectedMembers, member.tmbId]);
                    }
                  };
                  return (
                    <Flex
                      key={member.tmbId}
                      mt="1"
                      py="1"
                      px="3"
                      borderRadius="sm"
                      alignItems="center"
                      _hover={{
                        bgColor: 'myGray.50',
                        cursor: 'pointer'
                      }}
                      {...(selectedMembers.includes(member.tmbId) && {
                        bgColor: 'myGray.50'
                      })}
                      flexDirection="row"
                    >
                      <Checkbox
                        size="lg"
                        mr="3"
                        isChecked={selectedMembers.includes(member.tmbId)}
                        onChange={change}
                      />
                      <Flex
                        flexDirection="row"
                        onClick={change}
                        w="full"
                        justifyContent="space-between"
                      >
                        <Flex flexDirection="row" alignItems="center">
                          <MyAvatar src={member.avatar} w="32px" />
                          <Box ml="2">{member.memberName}</Box>
                        </Flex>
                        {collaboratorList?.find((v) => v.tmbId === member.tmbId)?.permission && (
                          <PermissionTags
                            permission={
                              collaboratorList?.find((v) => v.tmbId === member.tmbId)?.permission
                            }
                          />
                        )}
                      </Flex>
                    </Flex>
                  );
                })}
            </Flex>
          </Flex>
          <Flex p="4" flexDirection="column">
            <Box>已选: {selectedMembers.length}</Box>
            <Flex flexDirection="column" mt="2">
              {selectedMembers.map((tmbId) => {
                const member = teamMemberList?.find((v) => v.tmbId === tmbId);
                return (
                  <Flex
                    key={tmbId}
                    mt="1"
                    alignItems="center"
                    justifyContent="space-between"
                    flexDirection="row"
                    _hover={{
                      bgColor: 'myGray.50',
                      cursor: 'pointer'
                    }}
                    borderRadius="sm"
                    p="1"
                  >
                    <Flex>
                      <MyAvatar src={member?.avatar} w="24px" />
                      <Box ml="2">{member?.memberName}</Box>
                    </Flex>
                    <MyIcon
                      name="common/closeLight"
                      w="16px"
                      _hover={{
                        color: 'primary.500'
                      }}
                      onClick={() => setSelectedMembers(selectedMembers.filter((v) => v !== tmbId))}
                    />
                  </Flex>
                );
              })}
            </Flex>
          </Flex>
        </Grid>
      </ModalBody>
      <ModalFooter>
        <PermissionSelect value={selectedPermission} onChange={(v) => setSelectedPermission(v)} />
        <Button
          ml="4"
          onClick={() => {
            if (addCollaborators(selectedMembers, selectedPermission)) {
              toast({
                title: '添加成功',
                status: 'success',
                duration: 3000,
                isClosable: true
              });
              onClose();
            }
          }}
        >
          确认
        </Button>
      </ModalFooter>
    </MyModal>
  );
}
