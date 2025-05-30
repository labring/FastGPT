import React from 'react';
import { Box, Flex, Text } from '@chakra-ui/react';
import Avatar from '@fastgpt/web/components/common/Avatar';

type Props = {
  teamName?: string;
  teamAvatar?: string;
  slogan?: string;
};

const ChatWelcome = ({ teamName = 'FastGPT', teamAvatar, slogan }: Props) => {
  return (
    <Flex direction="column" align="center" gap={4} maxW="700px">
      <Flex align="center" gap={5}>
        {teamAvatar ? (
          <Flex
            w="60px"
            h="60px"
            borderRadius="15px"
            overflow="hidden"
            justifyContent="center"
            alignItems="center"
          >
            <Avatar w="100%" h="100%" src={teamAvatar} borderRadius="15px" />
          </Flex>
        ) : (
          <Box
            w="60px"
            h="60px"
            bg="white"
            border="1.25px solid #ECECEC"
            borderRadius="15px"
            overflow="hidden"
          >
            <Avatar w="100%" h="100%" src={teamAvatar} borderRadius="15px" />
          </Box>
        )}
        <Text fontSize="2xl" fontWeight="bold" color="#111824" fontFamily="Inter">
          {teamName}
        </Text>
      </Flex>
      {slogan && (
        <Text
          fontSize="lg"
          color="#707070"
          fontFamily="PingFang SC"
          textAlign="center"
          maxW="600px"
          whiteSpace="pre-line"
        >
          {slogan}
        </Text>
      )}
    </Flex>
  );
};

export default React.memo(ChatWelcome);
