import React from 'react';
import { Box, Flex } from '@chakra-ui/react';
import MyTag from '@fastgpt/web/components/common/Tag';

type Props = {
  metadata: Record<string, any>;
};

const renderValue = (val: any) => {
  if (Array.isArray(val)) {
    return (
      <Flex gap={1.5} flexWrap="wrap">
        {val.map((item, idx) => (
          <MyTag key={idx} colorSchema="blue" type="borderFill" fontSize="10px" py="1px" px={2}>
            {String(item)}
          </MyTag>
        ))}
      </Flex>
    );
  }
  if (typeof val === 'boolean') {
    return (
      <MyTag
        colorSchema={val ? 'green' : 'gray'}
        type="borderFill"
        showDot={true}
        fontSize="10px"
        py="1px"
        px={2}
      >
        {val ? 'true' : 'false'}
      </MyTag>
    );
  }
  if (val === null) {
    return (
      <MyTag colorSchema="gray" type="borderFill" fontSize="10px" py="1px" px={2}>
        null
      </MyTag>
    );
  }
  if (typeof val === 'object') {
    return (
      <Box
        as="pre"
        fontSize="11px"
        fontFamily="monospace"
        bg="myGray.50"
        p={2.5}
        borderRadius="md"
        maxW="100%"
        overflowX="auto"
        border="1px solid"
        borderColor="myGray.150"
      >
        {JSON.stringify(val, null, 2)}
      </Box>
    );
  }

  const strVal = String(val);
  const isVersion = /^[vV]?\d+(\.\d+)+$/.test(strVal);
  if (isVersion) {
    return (
      <MyTag colorSchema="adora" type="borderFill" fontSize="10px" py="1px" px={2}>
        {strVal}
      </MyTag>
    );
  }

  return (
    <Box color="myGray.800" fontSize="xs" lineHeight="1.5">
      {strVal}
    </Box>
  );
};

const MarkdownMetadataCard = ({ metadata }: Props) => {
  return (
    <Box
      mb={6}
      p={4}
      bg="myGray.25"
      borderRadius="6px"
      border="1px solid"
      borderColor="myGray.200"
      borderLeft="4px solid"
      borderLeftColor="primary.600"
      boxShadow="0 1px 3px rgba(0, 0, 0, 0.02)"
      transition="all 0.2s ease"
      _hover={{
        boxShadow: '0 4px 12px rgba(17, 24, 36, 0.05)',
        borderColor: 'myGray.300',
        borderLeftColor: 'primary.700'
      }}
    >
      <Box
        display="grid"
        gridTemplateColumns="110px 1fr"
        gap={3}
        rowGap={4}
        fontSize="xs"
        alignItems="center"
      >
        {Object.entries(metadata).map(([k, v]) => (
          <React.Fragment key={k}>
            <Box
              fontWeight="medium"
              color="myGray.500"
              textTransform="capitalize"
              fontSize="xs"
              alignSelf="start"
              pt="1px"
            >
              {k.replace(/_/g, ' ')}
            </Box>
            <Box color="myGray.800" whiteSpace="pre-wrap" wordBreak="break-word" alignSelf="center">
              {renderValue(v)}
            </Box>
          </React.Fragment>
        ))}
      </Box>
    </Box>
  );
};

export default React.memo(MarkdownMetadataCard);
