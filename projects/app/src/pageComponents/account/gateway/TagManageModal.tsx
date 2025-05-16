import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Button,
  Flex,
  Input,
  ModalBody,
  ModalFooter,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  useToast,
  HStack,
  IconButton,
  Tag,
  Container,
  Tooltip,
  Divider
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { getTeamTags, createTag, updateTag, deleteTag } from '@/web/core/app/api/tags';
import type { TagSchemaType, TagWithCountType } from '@fastgpt/global/core/app/tags';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTag from '@fastgpt/web/components/common/Tag';

// 颜色选项
const colorOptions: { value: string; color: string; bg: string }[] = [
  { value: 'blue', color: 'blue.600', bg: 'blue.50' },
  { value: 'green', color: 'green.600', bg: 'green.50' },
  { value: 'red', color: 'red.600', bg: 'red.50' },
  { value: 'yellow', color: 'yellow.600', bg: 'yellow.50' },
  { value: 'purple', color: 'purple.600', bg: 'purple.50' },
  { value: 'teal', color: 'teal.600', bg: 'teal.50' }
];

interface TagManageModalProps {
  onClose: () => void;
}

const TagManageModal = ({ onClose }: TagManageModalProps) => {
  const { t } = useTranslation();
  const toast = useToast();
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [editingTag, setEditingTag] = useState<{
    _id?: string;
    name: string;
    color: string;
  }>({ name: '', color: 'blue' });
  const [isEditing, setIsEditing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 获取标签列表 - 使用声明式加载方式
  const { data: tags = [], loading: loadingTags } = useRequest2(
    async () => {
      const result = await getTeamTags(true);
      return result as TagWithCountType[];
    },
    {
      manual: false,
      refreshDeps: [refreshTrigger],
      onSuccess: (data) => {
        console.log('getTeamTags success', data);
      }
    }
  );

  // 创建标签
  const { runAsync: createTagMutate, loading: createLoading } = useRequest2(
    (data: { name: string; color?: string }) => createTag(data),
    {
      onSuccess: () => {
        toast({
          title: '标签创建成功',
          status: 'success',
          duration: 3000,
          isClosable: true
        });
        setRefreshTrigger((prev) => prev + 1); // 触发刷新
        setIsCreating(false);
        setEditingTag({ name: '', color: 'blue' });
      }
    }
  );

  // 更新标签
  const { runAsync: updateTagMutate, loading: updateLoading } = useRequest2(
    (data: { tagId: string; name?: string; color?: string }) => updateTag(data),
    {
      onSuccess: () => {
        toast({
          title: '标签更新成功',
          status: 'success',
          duration: 3000,
          isClosable: true
        });
        setRefreshTrigger((prev) => prev + 1); // 触发刷新
        setIsEditing(false);
        setEditingTag({ name: '', color: 'blue' });
      }
    }
  );

  // 删除标签
  const { runAsync: deleteTagMutate, loading: deleteLoading } = useRequest2(
    (tagId: string) => deleteTag(tagId),
    {
      onSuccess: () => {
        toast({
          title: '标签删除成功',
          status: 'success',
          duration: 3000,
          isClosable: true
        });
        setRefreshTrigger((prev) => prev + 1); // 触发刷新
      }
    }
  );

  // 当创建或编辑模式激活时，聚焦输入框
  useEffect(() => {
    if ((isCreating || isEditing) && inputRef.current) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [isCreating, isEditing]);

  // 处理创建标签
  const handleCreateTag = () => {
    if (!editingTag.name.trim()) {
      toast({
        title: '标签名称不能为空',
        status: 'error',
        duration: 3000,
        isClosable: true
      });
      return;
    }

    createTagMutate({
      name: editingTag.name,
      color: editingTag.color
    });
  };

  // 处理更新标签
  const handleUpdateTag = () => {
    if (!editingTag.name.trim()) {
      toast({
        title: '标签名称不能为空',
        status: 'error',
        duration: 3000,
        isClosable: true
      });
      return;
    }

    if (!editingTag._id) return;

    updateTagMutate({
      tagId: editingTag._id,
      name: editingTag.name,
      color: editingTag.color
    });
  };

  // 处理删除标签
  const handleDeleteTag = (tagId: string) => {
    deleteTagMutate(tagId);
  };

  // 开始编辑标签
  const startEditTag = (tag: TagWithCountType) => {
    setEditingTag({
      _id: tag._id,
      name: tag.name,
      color: tag.color
    });
    setIsEditing(true);
    setIsCreating(false);
  };

  // 开始创建新标签
  const startCreateTag = () => {
    setEditingTag({ name: '', color: 'blue' });
    setIsCreating(true);
    setIsEditing(false);
  };

  // 取消编辑或创建
  const cancelEdit = () => {
    setIsEditing(false);
    setIsCreating(false);
    setEditingTag({ name: '', color: 'blue' });
  };

  const isLoading = loadingTags || createLoading || updateLoading || deleteLoading;

  // 添加自定义颜色处理函数
  const handleCustomColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEditingTag({ ...editingTag, color: e.target.value });
  };

  // 获取标签样式
  const getTagStyle = (color: string) => {
    // 处理预设颜色
    const preset = colorOptions.find((opt) => opt.value === color);
    if (preset) {
      return {
        colorScheme: color,
        bg: preset.bg,
        color: preset.color
      };
    }
    // 处理自定义颜色 (#XXXXXX)
    if (color.startsWith('#')) {
      return {
        bg: `${color}15`, // 15 表示透明度
        color: color
      };
    }
    // 默认返回蓝色
    return {
      colorScheme: 'blue',
      bg: 'blue.50',
      color: 'blue.600'
    };
  };

  return (
    <MyModal
      isOpen
      onClose={onClose}
      iconSrc="/imgs/modal/tag.svg"
      title="团队标签管理"
      w="680px"
      maxW="100%"
      isLoading={isLoading}
    >
      <ModalBody px={6} py={4}>
        <Container maxW="100%" p={0}>
          <Flex justifyContent="space-between" mb={6} alignItems="center">
            <Box fontSize="lg" fontWeight="500">
              标签 ({tags.length})
            </Box>
            <Button
              leftIcon={<MyIcon name="common/addLight" w="16px" />}
              onClick={startCreateTag}
              colorScheme="blue"
              size="sm"
              isDisabled={isCreating || isEditing}
            >
              创建标签
            </Button>
          </Flex>

          {/* 创建或编辑标签表单 */}
          {(isCreating || isEditing) && (
            <Box mb={6} p={5} borderWidth="1px" borderRadius="lg" bg="gray.50">
              <Flex direction="column" gap={4}>
                <Box fontSize="md" fontWeight="500" color="gray.700">
                  {isCreating ? '创建新标签' : '编辑标签'}
                </Box>
                <Flex gap={4} alignItems="center">
                  <Box width="80px" flexShrink={0} color="gray.600">
                    标签名称:
                  </Box>
                  <Input
                    ref={inputRef}
                    value={editingTag.name}
                    onChange={(e) => setEditingTag({ ...editingTag, name: e.target.value })}
                    placeholder="输入标签名称"
                    maxLength={20}
                    bg="white"
                    size="md"
                  />
                </Flex>
                <Flex gap={4} alignItems="center">
                  <Box width="80px" flexShrink={0} color="gray.600">
                    标签颜色:
                  </Box>
                  <Flex gap={3} flex={1} alignItems="center">
                    <Flex gap={3}>
                      {colorOptions.map((option) => (
                        <Box
                          key={option.value}
                          w="28px"
                          h="28px"
                          borderRadius="md"
                          bg={option.bg}
                          borderWidth={editingTag.color === option.value ? '2px' : '1px'}
                          borderColor={
                            editingTag.color === option.value ? option.color : 'gray.200'
                          }
                          cursor="pointer"
                          transition="all 0.2s"
                          _hover={{
                            transform: 'scale(1.1)',
                            boxShadow: 'sm'
                          }}
                          onClick={() => setEditingTag({ ...editingTag, color: option.value })}
                        />
                      ))}
                    </Flex>

                    <Divider orientation="vertical" h="28px" />

                    <Tooltip label="选择自定义颜色" placement="top">
                      <Box
                        position="relative"
                        w="28px"
                        h="28px"
                        borderRadius="md"
                        overflow="hidden"
                        borderWidth={editingTag.color.startsWith('#') ? '2px' : '1px'}
                        borderColor={
                          editingTag.color.startsWith('#') ? editingTag.color : 'gray.200'
                        }
                        bg={
                          editingTag.color.startsWith('#')
                            ? getTagStyle(editingTag.color).bg
                            : 'transparent'
                        }
                        cursor="pointer"
                        transition="all 0.2s"
                        _hover={{
                          transform: 'scale(1.1)',
                          boxShadow: 'sm'
                        }}
                      >
                        <Input
                          type="color"
                          value={editingTag.color.startsWith('#') ? editingTag.color : '#3370ff'}
                          onChange={handleCustomColorChange}
                          position="absolute"
                          top="0"
                          left="0"
                          width="150%"
                          height="150%"
                          transform="translate(-25%, -25%)"
                          cursor="pointer"
                          p={0}
                          opacity={0}
                        />
                      </Box>
                    </Tooltip>
                    <Box fontSize="sm" color="gray.600">
                      自定义颜色
                    </Box>
                  </Flex>
                </Flex>
                <Flex gap={4} alignItems="center">
                  <Box width="80px" flexShrink={0} color="gray.600">
                    预览:
                  </Box>
                  <Tag
                    size="md"
                    variant="subtle"
                    {...(editingTag.color.startsWith('#')
                      ? {
                          bg: `${editingTag.color}15`,
                          color: editingTag.color
                        }
                      : getTagStyle(editingTag.color))}
                    px={3}
                    py={1.5}
                  >
                    {editingTag.name || '标签预览'}
                  </Tag>
                </Flex>
                <Flex justifyContent="flex-end" gap={3} mt={2}>
                  <Button variant="outline" size="sm" onClick={cancelEdit}>
                    取消
                  </Button>
                  <Button
                    colorScheme="blue"
                    size="sm"
                    onClick={isCreating ? handleCreateTag : handleUpdateTag}
                  >
                    {isCreating ? '创建' : '保存'}
                  </Button>
                </Flex>
              </Flex>
            </Box>
          )}

          {/* 标签列表 */}
          <Box overflowX="auto" borderWidth="1px" borderRadius="lg" boxShadow="sm">
            <Table variant="simple">
              <Thead bg="gray.50">
                <Tr>
                  <Th width="45%">标签名称</Th>
                  <Th width="25%">使用次数</Th>
                  <Th width="30%">操作</Th>
                </Tr>
              </Thead>
              <Tbody>
                {(tags as TagWithCountType[]).map((tag) => (
                  <Tr key={tag._id}>
                    <Td>
                      <Tag size="md" variant="subtle" {...getTagStyle(tag.color)} px={3} py={1.5}>
                        {tag.name}
                      </Tag>
                    </Td>
                    <Td>{tag.count || 0}</Td>
                    <Td>
                      <HStack spacing={3}>
                        <IconButton
                          aria-label="编辑"
                          icon={<MyIcon name="edit" w="16px" />}
                          size="sm"
                          variant="ghost"
                          onClick={() => startEditTag(tag)}
                          isDisabled={isCreating || isEditing}
                        />
                        <IconButton
                          aria-label="删除"
                          icon={<MyIcon name="delete" w="16px" />}
                          size="sm"
                          variant="ghost"
                          colorScheme="red"
                          onClick={() => handleDeleteTag(tag._id)}
                          isDisabled={isCreating || isEditing}
                        />
                      </HStack>
                    </Td>
                  </Tr>
                ))}
                {tags.length === 0 && !loadingTags && (
                  <Tr>
                    <Td colSpan={3} textAlign="center" py={6} color="gray.500">
                      暂无标签
                    </Td>
                  </Tr>
                )}
              </Tbody>
            </Table>
          </Box>
        </Container>
      </ModalBody>
      <ModalFooter borderTopWidth="1px" py={4}>
        <Button onClick={onClose}>关闭</Button>
      </ModalFooter>
    </MyModal>
  );
};

export default TagManageModal;
