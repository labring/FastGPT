import React, { useState, useEffect } from 'react';
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
  Badge,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
  Switch,
  Alert,
  AlertIcon
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useForm, Controller } from 'react-hook-form';
import { useMutation, useQuery } from '@tanstack/react-query';
import { updateUser, getTeamListForAdmin, resetUserPassword } from '@/web/support/user/admin/api';
import type { UpdateUserBody } from '@/pages/api/support/user/admin/update';
import type { UserListItemType } from '@/pages/api/support/user/admin/list';
import { UserStatusEnum } from '@fastgpt/global/support/user/constant';
import {
  TeamMemberRoleEnum,
  TeamMemberStatusEnum
} from '@fastgpt/global/support/user/team/constant';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';

interface EditUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  user: UserListItemType;
}

type FormData = {
  username: string;
  status: `${UserStatusEnum}`;
  timezone: string;
  promotionRate: number;
  newPassword?: string;
  confirmPassword?: string;
};

const EditUserModal: React.FC<EditUserModalProps> = ({ isOpen, onClose, onSuccess, user }) => {
  const { t } = useTranslation();
  const toast = useToast();
  const { ConfirmModal, openConfirm } = useConfirm();
  const [showPasswordReset, setShowPasswordReset] = useState(false);

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isValid, isDirty }
  } = useForm<FormData>({
    defaultValues: {
      username: user.username,
      status: user.status,
      timezone: user.timezone,
      promotionRate: user.promotionRate * 100
    }
  });

  const newPassword = watch('newPassword');

  // 获取团队列表
  const { data: teamList = [] } = useQuery({
    queryKey: ['teamListForAdmin'],
    queryFn: getTeamListForAdmin
  });

  // 更新用户
  const updateMutation = useMutation({
    mutationFn: updateUser,
    onSuccess: () => {
      toast({
        title: t('user:admin.update_success'),
        status: 'success'
      });
      onSuccess();
    },
    onError: (error: any) => {
      toast({
        title: t('user:admin.update_failed'),
        description: error.message,
        status: 'error'
      });
    }
  });

  // 重置密码
  const resetPasswordMutation = useMutation({
    mutationFn: resetUserPassword,
    onSuccess: () => {
      toast({
        title: t('user:admin.password_reset_success'),
        status: 'success'
      });
      setShowPasswordReset(false);
      setValue('newPassword', '');
      setValue('confirmPassword', '');
    },
    onError: (error: any) => {
      toast({
        title: t('user:admin.password_reset_failed'),
        description: error.message,
        status: 'error'
      });
    }
  });

  const onSubmit = (data: FormData) => {
    const updateData: UpdateUserBody = {
      userId: user._id,
      username: data.username !== user.username ? data.username : undefined,
      status: data.status !== user.status ? data.status : undefined,
      timezone: data.timezone !== user.timezone ? data.timezone : undefined,
      promotionRate:
        data.promotionRate / 100 !== user.promotionRate ? data.promotionRate / 100 : undefined
    };

    // 如果设置了新密码
    if (data.newPassword) {
      if (data.newPassword !== data.confirmPassword) {
        toast({
          title: t('user:password_not_match'),
          status: 'error'
        });
        return;
      }
      updateData.password = data.newPassword;
    }

    updateMutation.mutate(updateData);
  };

  const handlePasswordReset = () => {
    const password = watch('newPassword');
    const confirmPassword = watch('confirmPassword');

    if (!password || password !== confirmPassword) {
      toast({
        title: t('user:password_not_match'),
        status: 'error'
      });
      return;
    }

    openConfirm(
      () => {
        resetPasswordMutation.mutate({
          userId: user._id,
          newPassword: password
        });
      },
      undefined,
      t('user:admin.confirm_reset_password')
    )();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case UserStatusEnum.active:
        return 'green';
      case UserStatusEnum.inactive:
        return 'gray';
      case UserStatusEnum.forbidden:
        return 'red';
      default:
        return 'gray';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case UserStatusEnum.active:
        return t('user:user_status.active');
      case UserStatusEnum.inactive:
        return t('user:user_status.inactive');
      case UserStatusEnum.forbidden:
        return t('user:user_status.forbidden');
      default:
        return status;
    }
  };

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} size="xl">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>
            <HStack>
              <Text>{t('user:admin.edit_user')}</Text>
              <Badge colorScheme={getStatusColor(user.status)}>{getStatusText(user.status)}</Badge>
            </HStack>
          </ModalHeader>
          <ModalCloseButton />

          <ModalBody>
            <Tabs>
              <TabList>
                <Tab>{t('user:basic_info')}</Tab>
                <Tab>{t('user:security')}</Tab>
                <Tab>{t('user:teams')}</Tab>
              </TabList>

              <TabPanels>
                {/* 基本信息 */}
                <TabPanel>
                  <form onSubmit={handleSubmit(onSubmit)}>
                    <VStack spacing={4} align="stretch">
                      <Alert status="info" size="sm">
                        <AlertIcon />
                        <Text fontSize="sm">{t('user:admin.edit_user_info')}</Text>
                      </Alert>

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
                    </VStack>
                  </form>
                </TabPanel>

                {/* 安全设置 */}
                <TabPanel>
                  <VStack spacing={4} align="stretch">
                    <Alert status="warning" size="sm">
                      <AlertIcon />
                      <Text fontSize="sm">{t('user:admin.password_reset_warning')}</Text>
                    </Alert>

                    <FormControl display="flex" alignItems="center">
                      <FormLabel htmlFor="password-reset" mb="0">
                        {t('user:admin.enable_password_reset')}
                      </FormLabel>
                      <Switch
                        id="password-reset"
                        isChecked={showPasswordReset}
                        onChange={(e) => setShowPasswordReset(e.target.checked)}
                      />
                    </FormControl>

                    {showPasswordReset && (
                      <VStack spacing={3} align="stretch">
                        <FormControl isInvalid={!!errors.newPassword}>
                          <FormLabel>{t('user:new_password')}</FormLabel>
                          <Controller
                            name="newPassword"
                            control={control}
                            rules={{
                              minLength: {
                                value: 6,
                                message: t('user:password_min_length')
                              }
                            }}
                            render={({ field }) => (
                              <Input
                                {...field}
                                type="password"
                                placeholder={t('user:new_password_placeholder')}
                              />
                            )}
                          />
                        </FormControl>

                        <FormControl isInvalid={!!errors.confirmPassword}>
                          <FormLabel>{t('user:confirm_password')}</FormLabel>
                          <Controller
                            name="confirmPassword"
                            control={control}
                            rules={{
                              validate: (value) =>
                                !newPassword ||
                                value === newPassword ||
                                t('user:password_not_match')
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

                        <Button
                          colorScheme="orange"
                          onClick={handlePasswordReset}
                          isLoading={resetPasswordMutation.isLoading}
                          isDisabled={!newPassword || newPassword !== watch('confirmPassword')}
                        >
                          {t('user:admin.reset_password')}
                        </Button>
                      </VStack>
                    )}
                  </VStack>
                </TabPanel>

                {/* 团队管理 */}
                <TabPanel>
                  <VStack spacing={4} align="stretch">
                    <Text fontSize="md" fontWeight="semibold">
                      {t('user:current_teams')}
                    </Text>

                    {user.teams.length === 0 ? (
                      <Text color="gray.500" fontSize="sm">
                        {t('user:no_teams')}
                      </Text>
                    ) : (
                      <VStack spacing={2} align="stretch">
                        {user.teams.map((team) => (
                          <HStack
                            key={team.teamId}
                            justify="space-between"
                            p={3}
                            bg="gray.50"
                            borderRadius="md"
                          >
                            <VStack align="start" spacing={1}>
                              <Text fontWeight="medium">{team.teamName}</Text>
                              <HStack>
                                <Badge size="sm" colorScheme="blue">
                                  {team.role}
                                </Badge>
                                <Badge
                                  size="sm"
                                  colorScheme={team.status === 'active' ? 'green' : 'gray'}
                                >
                                  {team.status}
                                </Badge>
                              </HStack>
                            </VStack>
                            <Button size="sm" variant="outline" colorScheme="red">
                              {t('user:remove_from_team')}
                            </Button>
                          </HStack>
                        ))}
                      </VStack>
                    )}
                  </VStack>
                </TabPanel>
              </TabPanels>
            </Tabs>
          </ModalBody>

          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={onClose}>
              {t('common:Cancel')}
            </Button>
            <Button
              colorScheme="blue"
              onClick={handleSubmit(onSubmit)}
              isLoading={updateMutation.isLoading}
              isDisabled={!isDirty}
            >
              {t('common:Save')}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <ConfirmModal />
    </>
  );
};

export default EditUserModal;
