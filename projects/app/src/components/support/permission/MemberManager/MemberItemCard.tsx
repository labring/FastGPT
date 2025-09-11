import React from 'react';
import { Box, Checkbox, Flex, HStack, VStack } from '@chakra-ui/react';
import Avatar from '@fastgpt/web/components/common/Avatar';
import RoleTags from './RoleTags';
import type { RoleValueType } from '@fastgpt/global/support/permission/type';
import MyIcon from '@fastgpt/web/components/common/Icon';
import OrgTags from '../../user/team/OrgTags';
import RoleSelect from './RoleSelect';
import { ChevronDownIcon } from '@chakra-ui/icons';

function MemberItemCard({
  avatar,
  key,
  onChange,
  isChecked,
  onDelete,
  name,
  role,
  orgs,
  rightSlot,
  onRoleChange,
  disabled = false
}: {
  avatar: string;
  key: string;
  onChange?: () => void;
  onRoleChange?: (role: RoleValueType) => void;
  isChecked?: boolean;
  onDelete?: () => void;
  name: string;
  role?: RoleValueType;
  orgs?: string[];
  rightSlot?: React.ReactNode;
  disabled?: boolean;
}) {
  const showRoleSelect = onRoleChange !== undefined;
  return (
    <Flex
      justifyContent="space-between"
      alignItems="start"
      key={key}
      px="3"
      py="2"
      gap="4"
      borderRadius="sm"
      _hover={{
        bgColor: 'myGray.50'
      }}
      cursor={disabled ? 'not-allowed' : 'pointer'}
      onClick={() => {
        if (disabled) return;
        onChange?.();
      }}
    >
      <Flex
        flexDirection={'row'}
        h={showRoleSelect ? '50px' : 'unset'}
        p="2"
        alignItems={'center'}
        gap="2"
        w="full"
      >
        {isChecked !== undefined && <Checkbox isChecked={isChecked} pointerEvents="none" />}
        <Avatar src={avatar} w="1.5rem" borderRadius={'50%'} />
        <Flex justifyContent={'start'} flexDirection={'column'} w="full">
          <Box fontSize={'sm'} className="textEllipsis" maxW={'100px'}>
            {name}
          </Box>
          <Box lineHeight={1} maxW="100px">
            {orgs && orgs.length > 0 && <OrgTags orgs={orgs} />}
          </Box>
        </Flex>
      </Flex>
      {showRoleSelect && (
        <RoleSelect
          disabled={disabled}
          value={role}
          Button={
            <Flex
              bg={'myGray.50'}
              border="base"
              fontSize={'sm'}
              borderRadius={'md'}
              minH={'50px'}
              w="250px"
              p="2"
              alignItems={'end'}
              justifyContent={'space-between'}
            >
              <RoleTags permission={role} />
              <Flex h="32px" alignItems={'center'} justifyContent={'center'}>
                <ChevronDownIcon fontSize="lg" />
              </Flex>
            </Flex>
          }
          onChange={onRoleChange}
        />
      )}
      {onDelete !== undefined && (
        <Flex flexDirection={'row'} h={showRoleSelect ? '50px' : 'unset'} alignItems={'center'}>
          <MyIcon
            name="common/closeLight"
            w="1rem"
            cursor={disabled ? 'not-allowed' : 'pointer'}
            _hover={{
              color: 'red.600'
            }}
            onClick={() => {
              if (disabled) return;
              onDelete?.();
            }}
          />
        </Flex>
      )}
      {rightSlot}
    </Flex>
  );
}

export default MemberItemCard;
