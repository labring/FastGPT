import React, { useState } from 'react';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalBody,
  ModalCloseButton,
  Button,
  FormControl,
  FormLabel,
  Input,
  Textarea,
  VStack,
  HStack,
  Text,
  useToast,
  Select,
  Box,
  Tag,
  TagLabel,
  TagCloseButton,
  Wrap,
  WrapItem,
  Avatar
} from '@chakra-ui/react';
import { useForm } from 'react-hook-form';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { TeamMemberRoleEnum } from '@fastgpt/global/support/user/team/constant';

type CreateTeamFormData = {
  name: string;
  ownerId: string;
  description: string;
  avatar: string;
};

type UserOption = {
  _id: string;
  username: string;
  avatar?: string;
};

interface CreateTeamModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// 获取用户列表的API函数
const getUserList = async (): Promise<UserOption[]> => {
  const response = await fetch('/api/support/user/admin/list?pageSize=100&current=1');
  if (!response.ok) {
    throw new Error('Failed to fetch users');
  }
  const data = await response.json();
  return data.data?.list || [];
};

// 创建团队的API函数
const createTeam = async (teamData: {
  name: string;
  ownerId: string;
  description?: string;
  avatar?: string;
  memberIds?: string[];
  memberRoles?: { [userId: string]: string };
}) => {
  const response = await fetch('/api/support/user/admin/teams/create', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(teamData)
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || '创建团队失败');
  }

  return response.json();
};

const CreateTeamModal: React.FC<CreateTeamModalProps> = ({ isOpen, onClose }) => {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [memberRoles, setMemberRoles] = useState<{ [userId: string]: string }>({});

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
    watch
  } = useForm<CreateTeamFormData>({
    defaultValues: {
      avatar: '/icon/logo.svg'
    }
  });

  // 获取用户列表
  const { data: userList = [], isLoading: isLoadingUsers } = useQuery({
    queryKey: ['userList'],
    queryFn: getUserList,
    enabled: isOpen
  });

  // 创建团队mutation
  const createTeamMutation = useMutation({
    mutationFn: createTeam,
    onSuccess: () => {
      toast({
        title: '创建成功',
        description: '团队已成功创建',
        status: 'success',
        duration: 3000,
        isClosable: true
      });
      queryClient.invalidateQueries({ queryKey: ['teamList'] });
      handleClose();
    },
    onError: (error: any) => {
      toast({
        title: '创建失败',
        description: error.message,
        status: 'error',
        duration: 5000,
        isClosable: true
      });
    }
  });

  const handleClose = () => {
    reset();
    setSelectedMembers([]);
    setMemberRoles({});
    onClose();
  };

  const onSubmit = (data: CreateTeamFormData) => {
    createTeamMutation.mutate({
      name: data.name,
      ownerId: data.ownerId,
      description: data.description,
      avatar: data.avatar,
      memberIds: selectedMembers,
      memberRoles
    });
  };

  const handleAddMember = (userId: string) => {
    if (!selectedMembers.includes(userId)) {
      setSelectedMembers([...selectedMembers, userId]);
      setMemberRoles({
        ...memberRoles,
        [userId]: TeamMemberRoleEnum.member
      });
    }
  };

  const handleRemoveMember = (userId: string) => {
    setSelectedMembers(selectedMembers.filter((id) => id !== userId));
    const newRoles = { ...memberRoles };
    delete newRoles[userId];
    setMemberRoles(newRoles);
  };

  const handleRoleChange = (userId: string, role: string) => {
    setMemberRoles({
      ...memberRoles,
      [userId]: role
    });
  };

  const selectedOwner = userList.find((user) => user._id === watch('ownerId'));

  return (
    <Modal isOpen={isOpen} onClose={handleClose} size="lg">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>创建团队</ModalHeader>
        <ModalCloseButton />

        <form onSubmit={handleSubmit(onSubmit)}>
          <ModalBody>
            <VStack spacing={4} align="stretch">
              {/* 团队名称 */}
              <FormControl isRequired isInvalid={!!errors.name}>
                <FormLabel>团队名称</FormLabel>
                <Input
                  {...register('name', {
                    required: '团队名称不能为空',
                    minLength: { value: 2, message: '团队名称至少2个字符' },
                    maxLength: { value: 50, message: '团队名称不能超过50个字符' }
                  })}
                  placeholder="请输入团队名称"
                />
                {errors.name && (
                  <Text color="red.500" fontSize="sm" mt={1}>
                    {errors.name.message}
                  </Text>
                )}
              </FormControl>

              {/* 团队所有者 */}
              <FormControl isRequired isInvalid={!!errors.ownerId}>
                <FormLabel>团队所有者</FormLabel>
                <Select
                  {...register('ownerId', { required: '请选择团队所有者' })}
                  placeholder="请选择团队所有者"
                  isDisabled={isLoadingUsers}
                >
                  {userList.map((user) => (
                    <option key={user._id} value={user._id}>
                      {user.username}
                    </option>
                  ))}
                </Select>
                {errors.ownerId && (
                  <Text color="red.500" fontSize="sm" mt={1}>
                    {errors.ownerId.message}
                  </Text>
                )}
              </FormControl>

              {/* 团队描述 */}
              <FormControl>
                <FormLabel>团队描述</FormLabel>
                <Textarea
                  {...register('description')}
                  placeholder="请输入团队描述（可选）"
                  rows={3}
                />
              </FormControl>

              {/* 添加成员 */}
              <FormControl>
                <FormLabel>添加成员</FormLabel>
                <Select
                  placeholder="选择要添加的成员"
                  onChange={(e) => {
                    if (e.target.value) {
                      handleAddMember(e.target.value);
                      e.target.value = '';
                    }
                  }}
                >
                  {userList
                    .filter(
                      (user) => user._id !== watch('ownerId') && !selectedMembers.includes(user._id)
                    )
                    .map((user) => (
                      <option key={user._id} value={user._id}>
                        {user.username}
                      </option>
                    ))}
                </Select>
              </FormControl>

              {/* 已选择的成员 */}
              {selectedMembers.length > 0 && (
                <Box>
                  <Text fontSize="sm" fontWeight="medium" mb={2}>
                    已选择的成员 ({selectedMembers.length})
                  </Text>
                  <VStack spacing={2} align="stretch">
                    {selectedMembers.map((userId) => {
                      const user = userList.find((u) => u._id === userId);
                      if (!user) return null;

                      return (
                        <HStack
                          key={userId}
                          justify="space-between"
                          p={2}
                          bg="gray.50"
                          borderRadius="md"
                        >
                          <HStack>
                            <Avatar size="sm" src={user.avatar} name={user.username} />
                            <Text>{user.username}</Text>
                          </HStack>
                          <HStack>
                            <Select
                              size="sm"
                              value={memberRoles[userId] || TeamMemberRoleEnum.member}
                              onChange={(e) => handleRoleChange(userId, e.target.value)}
                              w="120px"
                            >
                              <option value={TeamMemberRoleEnum.member}>成员</option>
                              <option value={TeamMemberRoleEnum.admin}>管理员</option>
                            </Select>
                            <Button
                              size="sm"
                              variant="ghost"
                              colorScheme="red"
                              onClick={() => handleRemoveMember(userId)}
                            >
                              <MyIcon name="common/trash" w="14px" />
                            </Button>
                          </HStack>
                        </HStack>
                      );
                    })}
                  </VStack>
                </Box>
              )}
            </VStack>
          </ModalBody>

          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={handleClose}>
              取消
            </Button>
            <Button
              type="submit"
              colorScheme="blue"
              isLoading={isSubmitting || createTeamMutation.isLoading}
              loadingText="创建中..."
            >
              创建团队
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
};

export default CreateTeamModal;
