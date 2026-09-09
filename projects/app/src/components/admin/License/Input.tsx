import React, { useEffect, useState } from 'react';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import { Box, Button, Flex, HStack, Textarea } from '@chakra-ui/react';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import Icon from '@fastgpt/web/components/common/Icon';
import Markdown from '@/components/admin/markdown';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { getInstanceId, postActiveLicense } from '@/web/common/license/api';

const LicenseInput = ({ onClose }: { onClose?: () => void }) => {
  const { initLicenseData } = useSystemStore();
  const [license, setLicense] = useState('');
  // 决策版：绑定标记从 hosts（域名）改为 instanceId，激活时把实例 ID 提供给官方签发
  const [instanceId, setInstanceId] = useState<string>();

  useEffect(() => {
    getInstanceId()
      .then(setInstanceId)
      .catch(() => setInstanceId(undefined));
  }, []);

  const { runAsync: activeLicense, loading } = useRequest(postActiveLicense, {
    onSuccess: () => {
      initLicenseData();
      onClose?.();
    },
    successToast: '激活成功'
  });

  return (
    <MyModal
      title="系统激活"
      isOpen
      size="lg"
      footer={
        <>
          {onClose && (
            <Button variant="whiteBase" onClick={onClose}>
              取消
            </Button>
          )}
          <Button
            isLoading={loading}
            isDisabled={!license}
            onClick={() => activeLicense({ license })}
          >
            确认
          </Button>
        </>
      }
    >
      <HStack px="6" py="3" bgColor="primary.50" borderRadius="md" alignItems={'flex-start'}>
        <Icon name="common/info" w="1.2rem" color="primary.600" mt="0.2rem" />
        <Box fontSize={'sm'}>
          <Markdown source={`你需要使用 License 激活系统后才可继续使用。`}></Markdown>
          <Flex gap={2} mt={1} flexWrap={'wrap'} alignItems={'center'}>
            <Box flexShrink={0}>当前实例 ID:</Box>
            <Box
              color={'primary.600'}
              textDecoration={'underline'}
              userSelect={'all'}
              fontFamily={'mono'}
              fontSize={'xs'}
              wordBreak={'break-all'}
            >
              {instanceId ?? '加载中…'}
            </Box>
          </Flex>
          <Box mt={1} color={'myGray.500'} fontSize={'xs'}>
            请把上方实例 ID 提供给官方，官方将签发绑定该实例的 License。
          </Box>
        </Box>
      </HStack>
      <Textarea
        mt={5}
        bg={'myGray.25'}
        value={license}
        onChange={(e) => setLicense(e.target.value)}
        rows={10}
        placeholder="请输入 License"
      />
    </MyModal>
  );
};

export default LicenseInput;
