import React, { useState } from 'react';
import {
  Box,
  Flex,
  Text,
  Button,
  IconButton,
  Input,
  InputGroup,
  InputRightElement
} from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useCopyData } from '@fastgpt/web/hooks/useCopyData';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { CopyIcon } from '@chakra-ui/icons';
import { useUserStore } from '@/web/support/user/useUserStore';

// 分享门户组件
const ShareGateModal = ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => {
  const { copyData } = useCopyData();
  const { userInfo } = useUserStore();
  const teamId = userInfo?.team?.teamId || '';

  // 门户链接和自定义域名
  const [defaultGateUrl, setDefaultGateUrl] = useState(`${window.location.origin}/gate/${teamId}`);
  const [customDomain, setCustomDomain] = useState('');

  // 复制链接
  const handleCopyLink = (link: string) => {
    copyData(link, '链接已复制');
  };

  // 保存配置
  const handleSave = () => {
    // 保存自定义域名的逻辑
    onClose();
  };

  // 生成随机CNAME值
  const cnameDomain = 'lxjgiwggswmb.sealoshzh.site';

  return (
    <MyModal isOpen={isOpen} onClose={onClose} maxW="500px">
      <Box
        position="relative"
        width="500px"
        height="440px"
        bg="#FFFFFF"
        boxShadow="0px 32px 64px -12px rgba(19, 51, 107, 0.2), 0px 0px 1px rgba(19, 51, 107, 0.2)"
        borderRadius="10px"
      >
        {/* 弹窗头部 */}
        <Flex
          boxSizing="border-box"
          w="500px"
          h="48px"
          bg="#FBFBFC"
          borderBottom="1px solid #F4F4F7"
          justifyContent="space-between"
          alignItems="center"
          px="20px"
          borderTopLeftRadius="10px"
          borderTopRightRadius="10px"
          overflow="hidden"
        >
          <Flex alignItems="center" gap="10px">
            <MyIcon name="support/gate/home/sharePrimary" color="#3370FF" />
            <Text
              fontFamily="PingFang SC"
              fontWeight="500"
              fontSize="16px"
              lineHeight="24px"
              letterSpacing="0.15px"
              color="#24282C"
            >
              分享门户
            </Text>
          </Flex>
        </Flex>

        {/* 弹窗内容 */}
        <Box position="absolute" w="500px" h="392px" left="0px" top="48px">
          <Flex
            direction="column"
            alignItems="flex-start"
            padding="24px 36px"
            gap="24px"
            w="100%"
            h="100%"
          >
            {/* 上部内容区 */}
            <Flex direction="column" gap="20px" w="428px">
              {/* 提示信息 */}
              <Flex
                bg="#F0F4FF"
                borderRadius="6px"
                p="6px 12px"
                alignItems="center"
                w="100%"
                h="44px"
              >
                <Text
                  fontFamily="PingFang SC"
                  fontWeight="500"
                  fontSize="12px"
                  lineHeight="16px"
                  letterSpacing="0.5px"
                  color="#3370FF"
                >
                  通过门户进入的用户仍需登录账号及应用鉴权。
                  门户仅支持与已配置的应用对话，对话记录与站内聊天记录互通。
                </Text>
              </Flex>

              {/* 门户状态 */}
              <Flex alignItems="center" gap="12px">
                <Text
                  fontFamily="PingFang SC"
                  fontWeight="500"
                  fontSize="14px"
                  lineHeight="20px"
                  letterSpacing="0.1px"
                  color="#111824"
                >
                  门户状态:
                </Text>
                <Flex bg="#EDFBF3" borderRadius="6px" p="4px 8px" alignItems="center" gap="4px">
                  <Box w="6px" h="6px" borderRadius="50%" bg="#039855"></Box>
                  <Text
                    fontFamily="PingFang SC"
                    fontWeight="500"
                    fontSize="12px"
                    lineHeight="16px"
                    letterSpacing="0.5px"
                    color="#039855"
                  >
                    已启用
                  </Text>
                </Flex>
              </Flex>

              {/* 默认地址 */}
              <Flex direction="column" alignItems="flex-start" gap="8px" w="100%">
                <Text
                  fontFamily="PingFang SC"
                  fontWeight="500"
                  fontSize="14px"
                  lineHeight="20px"
                  letterSpacing="0.1px"
                  color="#24282C"
                >
                  默认地址
                </Text>
                <Flex w="100%" alignItems="center" gap="8px">
                  <Input
                    value={defaultGateUrl}
                    readOnly
                    h="32px"
                    bg="#FFFFFF"
                    border="1px solid #3370FF"
                    boxShadow="0px 0px 0px 2.4px rgba(51, 112, 255, 0.15)"
                    borderRadius="6px"
                    fontSize="12px"
                    color="#111824"
                    pl="12px"
                    flex="1"
                  />
                  <IconButton
                    aria-label="复制链接"
                    icon={<CopyIcon />}
                    size="sm"
                    variant="ghost"
                    colorScheme="gray"
                    onClick={() => handleCopyLink(defaultGateUrl)}
                    h="32px"
                    w="32px"
                    minW="32px"
                  />
                </Flex>
              </Flex>

              {/* 自定义域名 */}
              <Flex direction="column" alignItems="flex-start" gap="8px" w="100%">
                <Text
                  fontFamily="PingFang SC"
                  fontWeight="500"
                  fontSize="14px"
                  lineHeight="20px"
                  letterSpacing="0.1px"
                  color="#24282C"
                >
                  自定义域名
                </Text>
                <Flex w="100%" alignItems="center" gap="8px">
                  <Input
                    value={customDomain}
                    onChange={(e) => setCustomDomain(e.target.value)}
                    placeholder="请输入自定义域名"
                    h="32px"
                    bg="#F7F8FA"
                    border="1px solid #E8EBF0"
                    borderRadius="6px"
                    fontSize="12px"
                    color="#111824"
                    pl="12px"
                    flex="1"
                  />
                  <IconButton
                    aria-label="复制链接"
                    icon={<CopyIcon />}
                    size="sm"
                    variant="ghost"
                    colorScheme="gray"
                    onClick={() => handleCopyLink(customDomain)}
                    h="32px"
                    w="32px"
                    minW="32px"
                    isDisabled={!customDomain}
                  />
                </Flex>
                {/* CNAME提示信息 */}
                <Flex alignItems="center" gap="4px">
                  <MyIcon name="infoRounded" w="14px" h="14px" color="#3370FF" />
                  <Text
                    fontFamily="PingFang SC"
                    fontWeight="400"
                    fontSize="12px"
                    lineHeight="16px"
                    letterSpacing="0.004em"
                    color="#667085"
                  >
                    请到您的域名服务商处，添加该域名的、CNAME 解析到 {cnameDomain}
                    ，解析生效后即可绑定自定义域名。
                  </Text>
                </Flex>
              </Flex>
            </Flex>

            {/* 底部按钮 */}
            <Flex justifyContent="flex-end" w="100%" mt="auto">
              <Button
                variant="outline"
                h="32px"
                px="14px"
                fontSize="12px"
                mr="12px"
                onClick={onClose}
              >
                取消
              </Button>
              <Button
                bg="#3370FF"
                color="#FFFFFF"
                h="32px"
                px="14px"
                fontSize="12px"
                onClick={handleSave}
                _hover={{ bg: '#2860E1' }}
              >
                保存
              </Button>
            </Flex>
          </Flex>
        </Box>
      </Box>
    </MyModal>
  );
};

export default ShareGateModal;
