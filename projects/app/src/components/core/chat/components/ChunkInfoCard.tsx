import React, { useState, useMemo } from 'react';
import { Box, Flex, Link } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import Markdown from '@/components/Markdown';
import MyDivider from '@fastgpt/web/components/common/MyDivider';
import MyImage from '@fastgpt/web/components/common/Image/MyImage';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';

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
        <MyTooltip label={isExpanded ? t('common:Collapse') : t('common:Expand')}>
          <Flex alignItems={'center'} flex={1} gap={2} cursor={'pointer'} onClick={handleToggle}>
            {/* Toggle Button */}
            <Box
              className="toggle-icon"
              display={'flex'}
              alignItems={'center'}
              justifyContent={'center'}
              w={'16px'}
              h={'16px'}
              flexShrink={0}
              color={'myGray.500'}
            >
              <MyIcon
                name={isExpanded ? 'common/solidChevronDown' : 'common/solidChevronRight'}
                w={'16px'}
                h={'16px'}
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
        </MyTooltip>

        {/* Link Button */}
        {linkText && linkUrl && (
          <MyTooltip label={linkText}>
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
              maxW={'450px'}
              _hover={{
                textDecoration: 'none',
                bg: 'myGray.05'
              }}
            >
              <Box overflow={'hidden'} textOverflow={'ellipsis'} whiteSpace={'nowrap'}>
                {linkText}
              </Box>
              <MyIcon name={'common/rightArrowLight'} w={'12px'} h={'12px'} flexShrink={0} />
            </Link>
          </MyTooltip>
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
