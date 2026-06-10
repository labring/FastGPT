import React from 'react';
import { Box, Flex, Link } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyIcon from '../../../../common/Icon';
import Markdown from '../../../../common/Markdown';

const ReadmeBox = ({
  source,
  courseUrl,
  maxH
}: {
  source: string;
  courseUrl?: string;
  maxH?: string | number;
}) => {
  const { t } = useTranslation();

  return (
    <Box
      px={4}
      py={3}
      border="1px solid"
      borderColor="myGray.200"
      borderRadius="md"
      bg="myGray.50"
      fontSize="sm"
      color="myGray.900"
      flex="1"
      overflowY="auto"
      maxH={maxH}
    >
      {courseUrl && (
        <Flex
          as={Link}
          href={courseUrl}
          isExternal
          alignItems="center"
          gap={1.5}
          mb={3}
          color="primary.600"
          fontSize="sm"
          textDecoration="none"
          _hover={{ textDecoration: 'underline' }}
        >
          <MyIcon name="common/link" w={4} />
          <Box>{t('app:toolkit_tutorial_link')}</Box>
        </Flex>
      )}
      <Markdown source={source} />
    </Box>
  );
};

export default React.memo(ReadmeBox);
