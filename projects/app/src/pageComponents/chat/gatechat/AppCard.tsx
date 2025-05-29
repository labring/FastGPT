import { Box, Flex, Text, Tooltip, Button } from '@chakra-ui/react';
import type { AppListItemType } from '@fastgpt/global/core/app/type.d';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { useRouter } from 'next/router';
import React from 'react';
import { useTranslation } from 'next-i18next';

type Props = {
  app: AppListItemType;
  selectedId?: string;
  tagMap?: Map<string, any>;
};

const MAX_VISIBLE_TAGS = 2;

const AppCard = ({ app, selectedId, tagMap }: Props) => {
  const router = useRouter();
  const { t } = useTranslation();
  const tags = app.tags || [];
  const visibleTags = tags.slice(0, MAX_VISIBLE_TAGS);
  const remainingCount = Math.max(0, tags.length - MAX_VISIBLE_TAGS);

  const renderTags = (showAll = false) => {
    const tagsToShow = showAll ? tags : visibleTags;
    return (
      <Flex gap="4px" alignItems="center">
        {tagsToShow.map((tagId) => {
          const tag = tagMap?.get(tagId);
          if (!tag) return null;
          return (
            <Flex
              key={tagId}
              justifyContent="center"
              alignItems="center"
              padding="10px 8px"
              height="22px"
              bg="#F4F4F5"
              borderRadius="6px"
              minW="fit-content"
            >
              <Text
                fontSize="12px"
                fontWeight="500"
                lineHeight="16px"
                color="#525252"
                whiteSpace="nowrap"
              >
                {tag.name}
              </Text>
            </Flex>
          );
        })}
        {!showAll && remainingCount > 0 && (
          <Tooltip
            label={
              <Flex gap="4px" maxW="300px" p={2} flexWrap="wrap">
                {tags.slice(MAX_VISIBLE_TAGS).map((tagId) => {
                  const tag = tagMap?.get(tagId);
                  if (!tag) return null;
                  return (
                    <Flex
                      key={tagId}
                      justifyContent="center"
                      alignItems="center"
                      padding="10px 8px"
                      height="22px"
                      bg="#F4F4F5"
                      borderRadius="6px"
                      minW="fit-content"
                    >
                      <Text
                        fontSize="12px"
                        fontWeight="500"
                        lineHeight="16px"
                        color="#525252"
                        whiteSpace="nowrap"
                      >
                        {tag.name}
                      </Text>
                    </Flex>
                  );
                })}
              </Flex>
            }
            hasArrow
            placement="top"
            bg="white"
            color="inherit"
            p={0}
            boxShadow="lg"
          >
            <Flex
              justifyContent="center"
              alignItems="center"
              padding="10px 8px"
              height="22px"
              bg="#F4F4F5"
              borderRadius="6px"
              minW="fit-content"
            >
              <Text fontSize="12px" fontWeight="500" lineHeight="16px" color="#525252">
                +{remainingCount}
              </Text>
            </Flex>
          </Tooltip>
        )}
      </Flex>
    );
  };

  return (
    <Flex
      position="relative"
      flexDirection="column"
      justifyContent="space-between"
      alignItems="flex-start"
      padding="20px 20px 16px"
      width="370px"
      height="150px"
      cursor="pointer"
      borderRadius="12px"
      border="1px solid"
      borderColor={selectedId === app._id ? 'blue.500' : '#E8EBF0'}
      bg="#FFFFFF"
      boxShadow="0px 4px 4px rgba(19, 51, 107, 0.05), 0px 0px 1px rgba(19, 51, 107, 0.08)"
      _hover={{
        transform: 'translateY(-2px)',
        transition: 'all 0.2s ease-in-out'
      }}
      onClick={(e) => {
        // 防止按钮点击事件冒泡
        if ((e.target as HTMLElement).tagName !== 'BUTTON') {
          router.push(`/chat/gate/application?appId=${app._id}`);
        }
      }}
    >
      {/* 头部区域 */}
      <Flex alignItems="flex-start" gap="12px" width="330px" height="44px" alignSelf="stretch">
        {/* 图标 */}
        <Box
          width="32px"
          height="32px"
          borderRadius="4px"
          overflow="hidden"
          bg="blue.50"
          flexShrink={0}
        >
          {app.avatar ? (
            <Avatar src={app.avatar} w="100%" h="100%" />
          ) : (
            <Flex
              w="100%"
              h="100%"
              alignItems="center"
              justifyContent="center"
              fontSize="20px"
              fontWeight="bold"
              color="blue.500"
            >
              {app.name[0]?.toUpperCase()}
            </Flex>
          )}
        </Box>

        {/* 文本信息 */}
        <Flex
          flexDirection="column"
          alignItems="flex-start"
          gap="4px"
          width="286px"
          height="44px"
          flex={1}
        >
          <Text
            width="100%"
            height="24px"
            fontFamily="PingFang SC"
            fontWeight="500"
            fontSize="16px"
            lineHeight="24px"
            letterSpacing="0.15px"
            color={selectedId === app._id ? 'blue.500' : '#111824'}
            noOfLines={1}
            alignSelf="stretch"
          >
            {app.name}
          </Text>
          <Text
            width="273px"
            height="16px"
            fontFamily="PingFang SC"
            fontWeight="400"
            fontSize="12px"
            lineHeight="16px"
            letterSpacing="0.004em"
            color="#667085"
            noOfLines={1}
          >
            {app.intro || '-'}
          </Text>
        </Flex>
      </Flex>

      {/* 底部标签区域 */}
      <Flex justifyContent="space-between" alignItems="center" width="100%" height="22px">
        {/* 标签容器 */}
        <Flex justifyContent="flex-start" alignItems="center" gap="4px" height="22px" flex={1}>
          {renderTags()}
        </Flex>

        {/* 试用按钮 */}
        <Button
          size="sm"
          variant="ghost"
          onClick={(e) => {
            e.stopPropagation();
            router.push(`/chat/gate/application?appId=${app._id}`);
          }}
          px={0}
          py={0}
          height="auto"
          minW="unset"
          bg="transparent"
          _hover={{ bg: 'transparent', textDecoration: 'underline' }}
          _active={{ bg: 'transparent' }}
          _focus={{ boxShadow: 'none' }}
          fontFamily="PingFang SC"
          fontSize="12px"
          fontWeight="400"
          lineHeight="16px"
          letterSpacing="0.048px"
          color="#8A95A7"
        >
          {t('common:have_a_try')}
        </Button>
      </Flex>
    </Flex>
  );
};

export default AppCard;
