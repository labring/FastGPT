import React from 'react';
import { Box, Checkbox, HStack, VStack } from '@chakra-ui/react';
import Avatar from '@fastgpt/web/components/common/Avatar';
import PermissionTags from './PermissionTags';
import { PermissionValueType } from '@fastgpt/global/support/permission/type';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyPopover from '@fastgpt/web/components/common/MyPopover';

function MemberItemCard({
  avatar,
  key,
  onChange,
  isChecked,
  onDelete,
  name,
  permission,
  orgs
}: {
  avatar: string;
  key: string;
  onChange: () => void;
  isChecked?: boolean;
  onDelete?: () => void;
  name: string;
  permission?: PermissionValueType;
  orgs?: string[];
}) {
  return (
    <>
      <HStack
        justifyContent="space-between"
        key={key}
        py="1"
        px="3"
        borderRadius="sm"
        alignItems="center"
        _hover={{
          bgColor: 'myGray.50',
          cursor: 'pointer'
        }}
        onClick={onChange}
      >
        {isChecked !== undefined && <Checkbox isChecked={isChecked} pointerEvents="none" />}
        <Avatar src={avatar} w="1.5rem" borderRadius={'50%'} />
        <VStack w="full" gap={0}>
          <HStack w="full" ml="2">
            <Box w="full" mt={orgs && orgs.length > 0 ? '2' : ''}>
              {name}
            </Box>
            {permission && <PermissionTags permission={permission} />}
          </HStack>
          {orgs && orgs.length > 0 && (
            <MyPopover
              trigger="hover"
              Trigger={
                <Box fontSize="sm" fontWeight={400} w="full" color="myGray.500">
                  {orgs.map((org) => org.split('/').pop()).join(', ')}
                </Box>
              }
            >
              {() => (
                <VStack gap="1" p="2" alignItems={'start'}>
                  {orgs.map((org, index) => (
                    <Box key={index} fontSize="sm" fontWeight={400} color="myGray.500" ml="2">
                      {org.slice(1)}
                    </Box>
                  ))}
                </VStack>
              )}
            </MyPopover>
          )}
        </VStack>
        {onDelete !== undefined && (
          <MyIcon
            name="common/closeLight"
            w="1rem"
            cursor={'pointer'}
            _hover={{
              color: 'red.600'
            }}
            onClick={onDelete}
          />
        )}
      </HStack>
    </>
  );
}

export default MemberItemCard;
