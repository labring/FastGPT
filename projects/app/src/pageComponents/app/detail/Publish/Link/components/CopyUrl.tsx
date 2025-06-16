import React, { useMemo } from 'react';
import { Box, Flex, Input, InputGroup, InputRightElement, Button } from '@chakra-ui/react';

// 简化的类型定义
type SimpleAuth = {
  enabled?: boolean;
  secretKey?: string;
  expirationMs?: number;
};

// 简化的签名生成函数
const generateSignedUrl = (url: string, secretKey: string, expirationMs?: number): string => {
  // 简化版本，实际应用中需要正确的签名算法
  const timestamp = Date.now();
  const expires = timestamp + (expirationMs || 24 * 60 * 60 * 1000);
  return `${url}&timestamp=${timestamp}&expires=${expires}&signature=simple_signature`;
};

const CopyUrl = ({ shareId, simpleAuth }: { shareId: string; simpleAuth?: SimpleAuth }) => {
  // 生成分享链接
  const shareUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';

    const host = window.location.origin;
    let url = `${host}/chat/share?shareId=${shareId}`;

    // 如果启用了简单鉴权，生成带签名的URL
    if (simpleAuth?.enabled && simpleAuth.secretKey) {
      return generateSignedUrl(url, simpleAuth.secretKey, simpleAuth.expirationMs);
    }

    return url;
  }, [shareId, simpleAuth]);

  const handleCopy = async () => {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareUrl);
        // 这里可以添加成功提示
      } else {
        // fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = shareUrl;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
    } catch (err) {
      console.error('Failed to copy: ', err);
    }
  };

  return (
    <Flex alignItems={'center'} px={4} py={3} borderRadius={'md'} bgColor={'gray.50'}>
      <Box flex={1}>
        <InputGroup size={'sm'}>
          <Input
            isReadOnly
            variant={'unstyled'}
            fontWeight={'500'}
            placeholder="复制链接"
            value={shareUrl}
            onFocus={(e) => {
              e.target.select();
            }}
          />
          <InputRightElement width={'auto'}>
            <Button size={'xs'} onClick={handleCopy}>
              复制
            </Button>
          </InputRightElement>
        </InputGroup>
      </Box>
    </Flex>
  );
};

export default React.memo(CopyUrl);
