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
  Select,
  VStack,
  HStack,
  Text,
  Checkbox,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper,
  useToast,
  Divider,
  Box,
  Tag,
  TagLabel,
  TagCloseButton,
  Wrap,
  WrapItem
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useForm, Controller } from 'react-hook-form';
import { useMutation, useQuery } from '@tanstack/react-query';
import { createUser, getTeamListForAdmin } from '@/web/support/user/admin/api';
import type { CreateUserBody } from '@/pages/api/support/user/admin/create';
import { UserStatusEnum } from '@fastgpt/global/support/user/constant';
import { TeamMemberRoleEnum } from '@fastgpt/global/support/user/team/constant';
import MyIcon from '@fastgpt/web/components/common/Icon';

interface CreateUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type FormData = {
  username: string;
  password: string;
  confirmPassword: string;
  status: `${UserStatusEnum}`;
  timezone: string;
  promotionRate: number;
  selectedTeams: string[];
  teamRoles: { [teamId: string]: `${TeamMemberRoleEnum}` };
};

const CreateUserModal: React.FC<CreateUserModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const { t } = useTranslation();
  const toast = useToast();
  const [selectedTeams, setSelectedTeams] = useState<string[]>([]);

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isValid }
  } = useForm<FormData>({
    defaultValues: {
      username: '',
      password: '',
      confirmPassword: '',
      status: UserStatusEnum.active,
      timezone: 'Asia/Shanghai',
      promotionRate: 0,
      selectedTeams: [],
      teamRoles: {}
    }
  });

  const password = watch('password');

  // 获取团队列表
  const { data: teamList = [] } = useQuery({
    queryKey: ['teamListForAdmin'],
    queryFn: getTeamListForAdmin
  });

  // 创建用户
  const createMutation = useMutation({
    mutationFn: createUser,
    onSuccess: () => {
      toast({
        title: t('user:admin.create_success'),
        status: 'success'
      });
      onSuccess();
    },
    onError: (error: any) => {
      toast({
        title: t('user:admin.create_failed'),
        description: error.message,
        status: 'error'
      });
    }
  });

  const onSubmit = (data: FormData) => {
    if (data.password !== data.confirmPassword) {
      toast({
        title: t('user:password_not_match'),
        status: 'error'
      });
      return;
    }

    const createData: CreateUserBody = {
      username: data.username,
      password: data.password,
      status: data.status,
      timezone: data.timezone,
      promotionRate: data.promotionRate / 100,
      teamIds: selectedTeams,
      teamRoles: data.teamRoles
    };

    createMutation.mutate(createData);
  };

  const handleTeamSelect = (teamId: string) => {
    if (!selectedTeams.includes(teamId)) {
      const newSelectedTeams = [...selectedTeams, teamId];
      setSelectedTeams(newSelectedTeams);
      setValue('selectedTeams', newSelectedTeams);
      setValue(`teamRoles.${teamId}`, TeamMemberRoleEnum.member);
    }
  };

  const handleTeamRemove = (teamId: string) => {
    const newSelectedTeams = selectedTeams.filter((id) => id !== teamId);
    setSelectedTeams(newSelectedTeams);
    setValue('selectedTeams', newSelectedTeams);

    // 清除角色设置
    const currentRoles = watch('teamRoles');
    delete currentRoles[teamId];
    setValue('teamRoles', currentRoles);
  };

  const handleRoleChange = (teamId: string, role: `${TeamMemberRoleEnum}`) => {
    const currentRoles = watch('teamRoles');
    setValue('teamRoles', {
      ...currentRoles,
      [teamId]: role
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>{t('user:admin.create_user')}</ModalHeader>
        <ModalCloseButton />

        <ModalBody>
          <form onSubmit={handleSubmit(onSubmit)}>
            <VStack spacing={4} align="stretch">
              {/* 基本信息 */}
              <Text fontSize="md" fontWeight="semibold" color="gray.700">
                {t('user:basic_info')}
              </Text>

              <FormControl isRequired isInvalid={!!errors.username}>
                <FormLabel>{t('user:username')}</FormLabel>
                <Controller
                  name="username"
                  control={control}
                  rules={{
                    required: t('user:username_required'),
                    pattern: {
                      value: /^[a-zA-Z0-9@._-]+$/,
                      message: t('user:username_format_error')
                    }
                  }}
                  render={({ field }) => (
                    <Input {...field} placeholder={t('user:username_placeholder')} />
                  )}
                />
              </FormControl>

              <FormControl isRequired isInvalid={!!errors.password}>
                <FormLabel>{t('user:password')}</FormLabel>
                <Controller
                  name="password"
                  control={control}
                  rules={{
                    required: t('user:password_required'),
                    minLength: {
                      value: 6,
                      message: t('user:password_min_length')
                    }
                  }}
                  render={({ field }) => (
                    <Input
                      {...field}
                      type="password"
                      placeholder={t('user:password_placeholder')}
                    />
                  )}
                />
              </FormControl>

              <FormControl isRequired isInvalid={!!errors.confirmPassword}>
                <FormLabel>{t('user:confirm_password')}</FormLabel>
                <Controller
                  name="confirmPassword"
                  control={control}
                  rules={{
                    required: t('user:confirm_password_required'),
                    validate: (value) => value === password || t('user:password_not_match')
                  }}
                  render={({ field }) => (
                    <Input
                      {...field}
                      type="password"
                      placeholder={t('user:confirm_password_placeholder')}
                    />
                  )}
                />
              </FormControl>

              <HStack>
                <FormControl>
                  <FormLabel>状态</FormLabel>
                  <Controller
                    name="status"
                    control={control}
                    render={({ field }) => (
                      <Select {...field}>
                        <option value={UserStatusEnum.active}>
                          {t('user:user_status.active')}
                        </option>
                        <option value={UserStatusEnum.inactive}>
                          {t('user:user_status.inactive')}
                        </option>
                        <option value={UserStatusEnum.forbidden}>
                          {t('user:user_status.forbidden')}
                        </option>
                      </Select>
                    )}
                  />
                </FormControl>

                <FormControl>
                  <FormLabel>{t('user:timezone')}</FormLabel>
                  <Controller
                    name="timezone"
                    control={control}
                    render={({ field }) => (
                      <Select {...field}>
                        <option value="Asia/Shanghai">Asia/Shanghai</option>
                        <option value="America/New_York">America/New_York</option>
                        <option value="Europe/London">Europe/London</option>
                        <option value="Asia/Tokyo">Asia/Tokyo</option>
                      </Select>
                    )}
                  />
                </FormControl>
              </HStack>

              <FormControl>
                <FormLabel>{t('user:promotion_rate')} (%)</FormLabel>
                <Controller
                  name="promotionRate"
                  control={control}
                  render={({ field }) => (
                    <NumberInput {...field} min={0} max={100} step={0.1}>
                      <NumberInputField />
                      <NumberInputStepper>
                        <NumberIncrementStepper />
                        <NumberDecrementStepper />
                      </NumberInputStepper>
                    </NumberInput>
                  )}
                />
              </FormControl>

              <Divider />

              {/* 团队设置 */}
              <Text fontSize="md" fontWeight="semibold" color="gray.700">
                {t('user:team_settings')}
              </Text>

              <FormControl>
                <FormLabel>{t('user:select_teams')}</FormLabel>
                <Select
                  placeholder={t('user:select_team_placeholder')}
                  onChange={(e) => {
                    if (e.target.value) {
                      handleTeamSelect(e.target.value);
                      e.target.value = '';
                    }
                  }}
                >
                  {teamList
                    .filter((team) => !selectedTeams.includes(team._id))
                    .map((team) => (
                      <option key={team._id} value={team._id}>
                        {team.name} ({team.memberCount} {t('user:members')})
                      </option>
                    ))}
                </Select>
              </FormControl>

              {selectedTeams.length > 0 && (
                <Box>
                  <Text fontSize="sm" color="gray.600" mb={2}>
                    {t('user:selected_teams')}:
                  </Text>
                  <VStack spacing={2} align="stretch">
                    {selectedTeams.map((teamId) => {
                      const team = teamList.find((t) => t._id === teamId);
                      if (!team) return null;

                      return (
                        <HStack
                          key={teamId}
                          justify="space-between"
                          p={2}
                          bg="gray.50"
                          borderRadius="md"
                        >
                          <Text fontSize="sm">{team.name}</Text>
                          <HStack>
                            <Select
                              size="sm"
                              value={watch(`teamRoles.${teamId}`) || TeamMemberRoleEnum.member}
                              onChange={(e) => handleRoleChange(teamId, e.target.value as any)}
                              w="120px"
                            >
                              <option value={TeamMemberRoleEnum.owner}>所有者</option>
                              <option value={TeamMemberRoleEnum.admin}>管理员</option>
                              <option value={TeamMemberRoleEnum.member}>成员</option>
                            </Select>
                            <Button
                              size="sm"
                              variant="ghost"
                              colorScheme="red"
                              onClick={() => handleTeamRemove(teamId)}
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
          </form>
        </ModalBody>

        <ModalFooter>
          <Button variant="ghost" mr={3} onClick={onClose}>
            {t('common:Cancel')}
          </Button>
          <Button
            colorScheme="blue"
            onClick={handleSubmit(onSubmit)}
            isLoading={createMutation.isLoading}
            isDisabled={!isValid}
          >
            {t('common:new_create')}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default CreateUserModal;
