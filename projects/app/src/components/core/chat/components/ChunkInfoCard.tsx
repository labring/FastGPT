import React, { useState, useMemo } from 'react';
import { Box, Flex, Link } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import Markdown from '@/components/Markdown';
import MyDivider from '@fastgpt/web/components/common/MyDivider';
import MyImage from '@fastgpt/web/components/common/Image/MyImage';

interface ChunkInfoCardProps {
  title: string;
  descriptionList?: string[];
  linkText?: string;
  linkUrl?: string;
  q?: string;
  a?: string;
  imagePreviewUrl?: string;
}

const ChunkInfoCard = ({
  title,
  descriptionList = [],
  linkText,
  linkUrl,
  q = '',
  a = '',
  imagePreviewUrl
}: ChunkInfoCardProps) => {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);

  const handleToggle = () => {
    setIsExpanded(!isExpanded);
  };

  const handleLinkClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (linkUrl) {
      window.open(linkUrl, '_blank');
    }
  };

  return (
    <Box
      p={3}
      borderRadius={'md'}
      border={'1px solid'}
      borderColor={'borderColor.low'}
      bg={'white'}
    >
      {/* Header */}
      <Flex alignItems={'center'} justifyContent={'space-between'}>
        <Flex alignItems={'center'} flex={1} gap={2}>
          {/* Toggle Button */}
          <Box
            cursor={'pointer'}
            onClick={handleToggle}
            display={'flex'}
            alignItems={'center'}
            justifyContent={'center'}
            w={'16px'}
            h={'16px'}
            flexShrink={0}
          >
            <MyIcon
              name={isExpanded ? 'common/solidChevronDown' : 'common/solidChevronRight'}
              w={'16px'}
              h={'16px'}
              color={'myGray.500'}
            />
          </Box>

          {/* Title */}
          <Box
            fontSize={'sm'}
            fontWeight={'500'}
            lineHeight={'20px'}
            color={'myGray.900'}
            flexShrink={0}
          >
            {title}
          </Box>

          {/* Description List */}
          {descriptionList.length > 0 && (
            <Flex alignItems={'center'} gap={4} flexWrap={'wrap'} ml={2}>
              {descriptionList.map((desc, index) => (
                <Box
                  key={index}
                  fontSize={'xs'}
                  lineHeight={'16px'}
                  color={'myGray.500'}
                  flexShrink={0}
                >
                  {desc}
                </Box>
              ))}
            </Flex>
          )}
        </Flex>

        {/* Link Button */}
        {linkText && linkUrl && (
          <Link
            onClick={handleLinkClick}
            display={'flex'}
            alignItems={'center'}
            gap={1}
            px={2}
            py={'3px'}
            borderRadius={'md'}
            border={'1px solid'}
            borderColor={'borderColor.low'}
            fontSize={'xs'}
            color={'myGray.600'}
            flexShrink={0}
            cursor={'pointer'}
            _hover={{
              textDecoration: 'none',
              bg: 'myGray.05'
            }}
          >
            <Box>{linkText}</Box>
            <MyIcon name={'common/rightArrowLight'} w={'12px'} h={'12px'} />
          </Link>
        )}
      </Flex>

      {/* Content */}
      {(q || imagePreviewUrl) && (
        <Box
          mt={2}
          {...(isExpanded
            ? {}
            : {
                maxH: '67px',
                overflow: 'hidden'
              })}
        >
          {imagePreviewUrl ? (
            <Box display={['block', 'flex']} alignItems={'center'} gap={[3, 6]}>
              <Box flex="1 0 0">
                <MyImage
                  src={imagePreviewUrl}
                  alt={''}
                  w={'100%'}
                  h="100%"
                  maxH={'300px'}
                  objectFit="contain"
                />
              </Box>
              <Box flex="1 0 0" maxH={'300px'} overflow={'hidden'} fontSize="sm">
                <Markdown source={q} />
              </Box>
            </Box>
          ) : (
            <Box wordBreak={'break-all'}>
              {!!a ? (
                <>
                  <Box fontSize={'sm'} fontWeight={500} lineHeight={'20px'} color={'myGray.900'}>
                    <Markdown source={q} />
                  </Box>
                  <MyDivider my={2} h={'1px'} />
                  <Box fontSize={'xs'} lineHeight={'20px'} color={'myGray.500'}>
                    <Markdown source={a} />
                  </Box>
                </>
              ) : (
                <Box fontSize={'sm'}>
                  <Markdown source={q} />
                </Box>
              )}
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
};

export default React.memo(ChunkInfoCard);
