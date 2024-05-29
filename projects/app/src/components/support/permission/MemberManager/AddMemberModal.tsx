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
  Button
} from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useContextSelector } from 'use-context-selector';
import { CollaboratorContext } from '.';
import MyAvatar from '@/components/Avatar';
import { useState } from 'react';
import PermissionSelect, { type PermissionSelectListType } from './PermissionSelect';

export type AddModalPropsType = {
  onClose: () => void;
};

export function AddMemberModal({ onClose }: AddModalPropsType) {
  const { teamMemberList, collaboratorList, permissionConfig, permissionList } = useContextSelector(
    CollaboratorContext,
    (v) => v
  );
  const [searchText, setSearchText] = useState<string>('');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const SelectPermissionList: PermissionSelectListType = Object.entries(permissionConfig).map(
    ([key, value]) => {
      return {
        name: value.name,
        value: parseInt(key),
        description: value.description,
        type: value.type
      };
    }
  );

  const [selectedPermission, setSelectedPermission] = useState<number>(
    SelectPermissionList[0].value
  );

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
          border="1px solid"
          borderColor="myGray.200"
          mt="6"
          mx="8"
          borderRadius="0.5rem"
          templateColumns="60% 40%"
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
                    if (selectedMembers.includes(member.userId)) {
                      setSelectedMembers(selectedMembers.filter((v) => v !== member.userId));
                    } else {
                      setSelectedMembers([...selectedMembers, member.userId]);
                    }
                  };
                  return (
                    <Flex
                      key={member.userId}
                      mt="1"
                      alignItems="center"
                      _hover={{
                        bgColor: 'myGray.50',
                        cursor: 'pointer'
                      }}
                      {...(selectedMembers.includes(member.userId) && {
                        bgColor: 'myGray.50'
                      })}
                      flexDirection="row"
                    >
                      <Checkbox
                        size="lg"
                        mr="3"
                        isChecked={selectedMembers.includes(member.userId)}
                        onChange={change}
                      />
                      <Flex
                        flexDirection="row"
                        onClick={change}
                        w="full"
                        justifyContent="space-between"
                      >
                        <Flex flexDirection="row">
                          <MyAvatar src={member.avatar} w="24px" />
                          <Box ml="2">{member.memberName}</Box>
                        </Flex>
                        <Flex flexDirection="row">aaa</Flex>
                      </Flex>
                    </Flex>
                  );
                })}
            </Flex>
          </Flex>
          <Flex p="4" flexDirection="column">
            <Box>已选: {selectedMembers.length}</Box>
            <Flex flexDirection="column" mt="2">
              {selectedMembers.map((userId) => {
                const member = teamMemberList?.find((v) => v.userId === userId);
                return (
                  <Flex key={userId} mt="1" alignItems="start" flexDirection="row">
                    <MyAvatar src={member?.avatar} w="24px" />
                    <Box ml="2">{member?.memberName}</Box>
                  </Flex>
                );
              })}
            </Flex>
          </Flex>
        </Grid>
      </ModalBody>
      <ModalFooter>
        <PermissionSelect
          list={SelectPermissionList}
          value={selectedPermission}
          onChange={(v) => setSelectedPermission(v)}
        />
        <Button ml="4">确认</Button>
      </ModalFooter>
    </MyModal>
  );
}
