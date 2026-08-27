import React, { useMemo, useState } from 'react';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import { Box, Button, Flex, HStack, Textarea } from '@chakra-ui/react';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import Icon from '@fastgpt/web/components/common/Icon';
import Markdown from '@/components/admin/markdown';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { postActiveLicense } from '@/web/common/license/api';

const LicenseInput = ({ onClose }: { onClose?: () => void }) => {
  const { initLicenseData } = useSystemStore();
  const [license, setLicense] = useState('');
  const host = useMemo(() => {
    return window.location.host;
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
      <HStack px="6" py="3" bgColor="primary.50" borderRadius="md">
        <Icon name="common/info" w="1.2rem" color="primary.600" />
        <Box fontSize={'sm'}>
          <Markdown source={`你需要使用 License 激活系统后才可继续使用。`}></Markdown>
          <Flex gap={3}>
            <Box>当前域名为:</Box>
            <Box color={'primary.600'} textDecoration={'underline'} userSelect={'all'}>
              {host}
            </Box>
          </Flex>
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
