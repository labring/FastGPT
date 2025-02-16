import { Box, Flex, VStack } from '@chakra-ui/react';
import MyPopover from '@fastgpt/web/components/common/MyPopover';
import Tag from '@fastgpt/web/components/common/Tag';
import React from 'react';

function OrgTags({ orgs, type = 'simple' }: { orgs: string[]; type?: 'simple' | 'tag' }) {
  return (
    <MyPopover
      trigger="hover"
      Trigger={
        type === 'simple' ? (
          <Box fontSize="sm" fontWeight={400} w="full" color="myGray.500">
            {orgs.map((org) => org.split('/').pop()).join(', ')}
          </Box>
        ) : (
          <Flex direction="row" gap="1">
            {orgs.map((org, index) => (
              <Tag key={index}>{org.split('/').pop()}</Tag>
            ))}
          </Flex>
        )
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
  );
}

export default OrgTags;
