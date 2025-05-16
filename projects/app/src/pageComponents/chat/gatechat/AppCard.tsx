import {
  Box,
  Flex,
  Tag,
  Text,
  useColorModeValue,
  Tooltip,
  HStack,
  Wrap,
  WrapItem,
  Button,
  Divider
} from '@chakra-ui/react';
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

// 复用 AppTable 中的颜色选项
const colorOptions: { value: string; color: string; bg: string }[] = [
  { value: 'blue', color: 'blue.600', bg: 'blue.50' },
  { value: 'green', color: 'green.600', bg: 'green.50' },
  { value: 'red', color: 'red.600', bg: 'red.50' },
  { value: 'yellow', color: 'yellow.600', bg: 'yellow.50' },
  { value: 'purple', color: 'purple.600', bg: 'purple.50' },
  { value: 'teal', color: 'teal.600', bg: 'teal.50' }
];

// 获取标签样式
const getTagStyle = (color: string) => {
  // 处理预设颜色
  const preset = colorOptions.find((opt) => opt.value === color);
  if (preset) {
    return {
      bg: preset.bg,
      color: preset.color
    };
  }
  // 处理自定义颜色 (#XXXXXX)
  if (color.startsWith('#')) {
    return {
      bg: `${color}15`,
      color: color
    };
  }
  // 默认返回蓝色
  return {
    bg: 'blue.50',
    color: 'blue.600'
  };
};

const AppCard = ({ app, selectedId, tagMap }: Props) => {
  const router = useRouter();
  const { t } = useTranslation();
  const tags = app.tags || [];
  const visibleTags = tags.slice(0, MAX_VISIBLE_TAGS);
  const remainingCount = Math.max(0, tags.length - MAX_VISIBLE_TAGS);

  const renderTags = (showAll = false) => {
    const tagsToShow = showAll ? tags : visibleTags;
    return (
      <Wrap spacing={2}>
        {tagsToShow.map((tagId) => {
          const tag = tagMap?.get(tagId);
          if (!tag) return null;
          const tagStyle = getTagStyle(tag.color);
          return (
            <WrapItem key={tagId}>
              <Tag size="sm" variant="subtle" borderRadius="full" px={2} py={1} {...tagStyle}>
                {tag.name}
              </Tag>
            </WrapItem>
          );
        })}
        {!showAll && remainingCount > 0 && (
          <WrapItem>
            <Tooltip
              label={
                <Wrap spacing={2} maxW="300px" p={2}>
                  {tags.slice(MAX_VISIBLE_TAGS).map((tagId) => {
                    const tag = tagMap?.get(tagId);
                    if (!tag) return null;
                    const tagStyle = getTagStyle(tag.color);
                    return (
                      <WrapItem key={tagId}>
                        <Tag
                          size="sm"
                          variant="subtle"
                          borderRadius="full"
                          px={2}
                          py={1}
                          {...tagStyle}
                        >
                          {tag.name}
                        </Tag>
                      </WrapItem>
                    );
                  })}
                </Wrap>
              }
              hasArrow
              placement="top"
              bg="white"
              color="inherit"
              p={0}
              boxShadow="lg"
            >
              <Tag
                size="sm"
                variant="subtle"
                borderRadius="full"
                px={2}
                py={1}
                bg="gray.100"
                color="gray.500"
              >
                +{remainingCount}
              </Tag>
            </Tooltip>
          </WrapItem>
        )}
      </Wrap>
    );
  };

  return (
    <Flex
      position={'relative'}
      width={'370px'}
      height={'150px'}
      padding={'20px 20px 16px 20px'}
      flexDirection={'column'}
      justifyContent={'space-between'}
      alignItems={'flex-start'}
      cursor={'pointer'}
      borderRadius={'12px'}
      border={'1px solid'}
      borderColor={selectedId === app._id ? 'blue.500' : 'gray.200'}
      bg={'white'}
      boxShadow={'0px 4px 4px 0px rgba(19, 51, 107, 0.05), 0px 0px 1px 0px rgba(19, 51, 107, 0.08)'}
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
      <Flex width="100%" gap={3}>
        <Box
          w={'36px'}
          h={'36px'}
          borderRadius={'4px'}
          overflow={'hidden'}
          bg={'blue.50'}
          flexShrink={0}
        >
          {app.avatar ? (
            <Avatar src={app.avatar} w={'100%'} h={'100%'} />
          ) : (
            <Flex
              w={'100%'}
              h={'100%'}
              alignItems={'center'}
              justifyContent={'center'}
              fontSize={'20px'}
              fontWeight={'bold'}
              color={'blue.500'}
            >
              {app.name[0]?.toUpperCase()}
            </Flex>
          )}
        </Box>
        <Box flex={1}>
          <Text
            fontWeight={'500'}
            fontSize={'md'}
            noOfLines={1}
            color={selectedId === app._id ? 'blue.500' : 'gray.900'}
          >
            {app.name}
          </Text>
          <Text fontSize={'sm'} color={'gray.500'} noOfLines={2} mt={1} lineHeight={'1.4'}>
            {app.intro || '-'}
          </Text>
        </Box>
      </Flex>
      <Divider mt={4} mb={1} borderColor="gray.100" />
      <Flex width="100%" justifyContent="space-between" alignItems="center">
        <Box flex={1}>{renderTags()}</Box>
        <Button
          size="sm"
          variant="ghost"
          onClick={(e) => {
            e.stopPropagation();
            router.push(`/chat/gate/application?appId=${app._id}`);
          }}
          px={2}
          py={0}
          height="auto"
          minW="unset"
          bg="transparent"
          _hover={{ bg: 'transparent', textDecoration: 'underline' }}
          _active={{ bg: 'transparent' }}
          _focus={{ boxShadow: 'none' }}
          style={{
            color: 'var(--light-general-outline-highest, var(--Gray-Modern-400, #8A95A7))',
            fontFamily: 'PingFang SC',
            fontSize: '12px',
            fontStyle: 'normal',
            fontWeight: 400,
            lineHeight: '16px',
            letterSpacing: '0.048px',
            boxShadow: 'none',
            border: 'none',
            background: 'none',
            padding: 0
          }}
        >
          {t('common:have_a_try')}
        </Button>
      </Flex>
    </Flex>
  );
};

export default AppCard;
