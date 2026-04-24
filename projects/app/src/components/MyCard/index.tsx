import { Box, Flex, Text } from '@chakra-ui/react';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import React from 'react';

type MyCardProps = {
  avatar: string;
  name: string;
  intro?: string;
  author?: string;
  tags?: string[];
  isPromoted?: boolean;
  experienceUrl?: string;
  isMarketFeatured?: boolean;
  // 悬浮时右上角显示的操作节点，不传则始终显示 tags
  hoverAction?: React.ReactNode;
  onClick?: () => void;
};

const MyCard = ({
  avatar,
  name,
  intro,
  author,
  tags = [],
  isPromoted,
  experienceUrl,
  isMarketFeatured,
  hoverAction,
  onClick
}: MyCardProps) => {
  const { t } = useTranslation();

  const handleClick = () => {
    if (isMarketFeatured) {
      if (experienceUrl) {
        window.open(experienceUrl, '_blank');
      }
      return;
    }
    onClick?.();
  };

  const hasHoverAction = !!hoverAction;

  return (
    <Box
      role="group"
      w="100%"
      h="152px"
      bg="#FFFFFF"
      border="1px solid"
      borderColor="#DCE0E6"
      borderRadius="8px"
      position="relative"
      overflow="hidden"
      cursor="pointer"
      transition="border-color 0.15s"
      _hover={{ borderColor: '#91BBF2' }}
      onClick={handleClick}
    >
      <Flex direction="column" h="100%" pt="20px" px="20px" pb="16px">
        {/* 顶部行：avatar + 名称 | tags / hover action */}
        <Flex align="center" justify="space-between">
          <Flex alignContent="center" gap="8px" overflow="hidden" flex="1" mr="8px">
            <Avatar src={avatar} w="24px" h="24px" borderRadius="4px" flexShrink={0} />
            <Box
              fontSize="16px"
              fontWeight="500"
              lineHeight="24px"
              color="myWhite.1000"
              overflow="hidden"
              textOverflow="ellipsis"
              whiteSpace="nowrap"
            >
              {name}
            </Box>
          </Flex>

          <Flex gap="8px" align="center" flexShrink={0}>
            {/* 默认态：tags + 精选徽章；有 hoverAction 时悬浮隐藏 */}
            <Flex
              gap="8px"
              align="center"
              {...(hasHoverAction && !isMarketFeatured ? { _groupHover: { display: 'none' } } : {})}
            >
              {tags.map((tagName) => (
                <MyTag
                  colorSchema="gray"
                  key={tagName}
                  borderRadius="4px"
                  px="8px"
                  py="3px"
                  height="22px"
                  color="#505F73"
                  bg="#F4F4F7"
                  fontSize="12px"
                >
                  {tagName}
                </MyTag>
              ))}
              {isMarketFeatured && (
                <MyTag
                  colorSchema="yellow"
                  borderRadius="4px"
                  px="8px"
                  py="3px"
                  height="22px"
                  fontSize="12px"
                >
                  {t('app:template.recommended')}
                </MyTag>
              )}
            </Flex>

            {/* 悬浮态：自定义操作区 */}
            {hasHoverAction && !isMarketFeatured && (
              <Box display="none" _groupHover={{ display: 'flex' }}>
                {hoverAction}
              </Box>
            )}
          </Flex>
        </Flex>

        {/* 简介 */}
        <MyTooltip
          label={
            isMarketFeatured ? (
              <Flex color="myGray.500" alignItems={'center'}>
                <MyIcon name="common/info" w="16px" h="16px" mr={'4px'} flexShrink={0} />
                <Text fontWeight="600" fontSize="12px">
                  {t('app:template.market_featured_tip')}
                </Text>
              </Flex>
            ) : undefined
          }
          shouldWrapChildren={false}
          isDisabled={!isMarketFeatured}
          maxW="500px"
        >
          <Text flex="1" mt="12px" mb="24px" fontSize="12px" color="myWhite.900" noOfLines={2}>
            {intro}
          </Text>
        </MyTooltip>

        {/* 底部：贡献者 */}
        <Flex align="center" gap="4px">
          <MyIcon name="common/user" w="16px" color="myGray.400" />
          <Box fontSize="12px" color="myGray.500" whiteSpace="nowrap">
            {author || 'SF-FastGPT'}
          </Box>
        </Flex>
      </Flex>
    </Box>
  );
};

export default MyCard;
