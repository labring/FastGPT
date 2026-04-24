import { Box, Flex } from '@chakra-ui/react';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import React from 'react';

type MyCardProps = {
  avatar: string;
  name: string;
  intro?: string;
  author?: string;
  tags?: string[];
  isPromoted?: boolean;
  // 悬浮时右上角显示的操作节点，不传则始终显示 tags
  hoverAction?: React.ReactNode;
  onClick?: () => void;
};

const MyCard = ({ avatar, name, intro, author, tags = [], isPromoted, hoverAction, onClick }: MyCardProps) => {
  const { t } = useTranslation();

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
      onClick={onClick}
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
              {...(hasHoverAction ? { _groupHover: { display: 'none' } } : {})}
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
              {isPromoted && (
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
            {hasHoverAction && (
              <Box display="none" _groupHover={{ display: 'flex' }}>
                {hoverAction}
              </Box>
            )}
          </Flex>
        </Flex>

        {/* 简介 */}
        <Box
          flex="1"
          mt="12px"
          mb="24px"
          fontSize="12px"
          color="myWhite.900"
          overflow="hidden"
          display="-webkit-box"
          sx={{ WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}
        >
          {intro}
        </Box>

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
