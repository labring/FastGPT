import { Box, Button, Flex } from '@chakra-ui/react';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import React, { useEffect, useRef, type ReactNode } from 'react';
import { getAllTeamMembers } from '@/web/support/user/team/utils';

/**
 * 成员列表完整加载后才挂载编辑子树；加载失败展示重试入口，不将失败误判为 loading。
 * 调用方须以群组/组织 ID 作为 key，切换资源时一起重建请求状态和本地编辑草稿。
 */
const TeamMemberEditLoader = ({
  params,
  children
}: {
  params: Parameters<typeof getAllTeamMembers>[0];
  children: (members: Awaited<ReturnType<typeof getAllTeamMembers>>) => ReactNode;
}) => {
  const { t } = useSafeTranslation();
  const controllerRef = useRef<AbortController>();
  const { data, loading, error, refresh } = useRequest(
    () => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      return getAllTeamMembers(params, controller);
    },
    { manual: false, errorToast: '' }
  );

  useEffect(() => () => controllerRef.current?.abort(), []);

  if (loading) return <MyBox flex={1} minH="200px" isLoading />;
  if (error) {
    return (
      <Flex
        flex={1}
        minH="200px"
        align="center"
        justify="center"
        direction="column"
        gap={4}
        role="alert"
      >
        <Box>{t('common:core.chat.error.data_error')}</Box>
        <Button onClick={refresh}>{t('common:password_verification_retry')}</Button>
      </Flex>
    );
  }
  // 自动请求只会成功返回完整数组或抛错；排除 loading/error 后，空数组也属于可编辑状态。
  return children(data!);
};

export default TeamMemberEditLoader;
