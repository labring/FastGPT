import { useCopyData } from '@fastgpt/web/hooks/useCopyData';
import { Box, Image, Flex, ModalBody } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import MyImage from '@fastgpt/web/components/common/Image/MyImage';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { listCustomDomain } from '@/web/support/customDomain/api';
import { useState, useMemo } from 'react';
import MySelect from '@fastgpt/web/components/common/MySelect';

export type ShowShareLinkModalProps = {
  shareLink: string;
  onClose: () => void;
  img: string;
};

function ShowShareLinkModal({ shareLink, onClose, img }: ShowShareLinkModalProps) {
  const { copyData } = useCopyData();
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();

  const [customDomain, setCustomDomain] = useState<string | undefined>(undefined);

  const { data: customDomainList = [] } = useRequest2(listCustomDomain, {
    manual: false
  });

  // 从 shareLink 中提取原始域名
  const originalDomain = useMemo(() => {
    try {
      const url = new URL(shareLink);
      return url.origin;
    } catch {
      return '';
    }
  }, [shareLink]);

  // 计算显示的分享链接（使用自定义域名替换原始域名）
  const displayShareLink = useMemo(() => {
    if (!customDomain || !originalDomain) {
      return shareLink;
    }
    return shareLink.replace(originalDomain, `https://${customDomain}`);
  }, [shareLink, customDomain, originalDomain]);

  // 处理域名选择选项
  const domainOptions = useMemo(() => {
    const options = [
      {
        label: t('publish:use_default_domain') || '使用默认域名',
        value: ''
      }
    ];

    // 只显示已激活的自定义域名
    const activeDomains = customDomainList
      .filter((item) => item.status === 'active')
      .map((item) => ({
        label: item.domain,
        value: item.domain
      }));

    return [...options, ...activeDomains];
  }, [customDomainList, t]);

  return (
    <MyModal onClose={onClose} title={t('publish:show_share_link_modal_title')}>
      <ModalBody>
        {/* 自定义域名选择器 */}
        {domainOptions.length > 1 && (
          <Box mb={4}>
            <MySelect
              value={customDomain || ''}
              list={domainOptions}
              onChange={(value) => setCustomDomain(value || undefined)}
            />
          </Box>
        )}

        <Box borderRadius={'md'} bg={'myGray.100'} overflow={'hidden'} fontSize={'sm'}>
          <Flex
            p={3}
            bg={'myWhite.500'}
            border="base"
            borderTopLeftRadius={'md'}
            borderTopRightRadius={'md'}
          >
            <Box flex={1}>{t('publish:copy_link_hint')}</Box>
            <MyIcon
              name={'copy'}
              w={'16px'}
              color={'myGray.600'}
              cursor={'pointer'}
              _hover={{ color: 'primary.500' }}
              onClick={() => copyData(displayShareLink)}
            />
          </Flex>
          <Box whiteSpace={'pre'} p={3} overflowX={'auto'}>
            {displayShareLink}
          </Box>
        </Box>

        <Box mt="4" borderRadius="0.5rem" border="1px" borderStyle="solid" borderColor="myGray.200">
          <MyImage src={img} borderRadius="0.5rem" alt="" />
        </Box>

        <Box borderRadius={'md'} bg={'myGray.100'} overflow={'hidden'} fontSize={'sm'} mt="4">
          <Flex
            p={3}
            bg={'myWhite.500'}
            border="base"
            borderTopLeftRadius={'md'}
            borderTopRightRadius={'md'}
          >
            <Box flex="1">IP 白名单</Box>
            <MyIcon
              name={'copy'}
              w={'16px'}
              color={'myGray.600'}
              cursor={'pointer'}
              _hover={{ color: 'primary.500' }}
              onClick={() => copyData(feConfigs?.ip_whitelist || '')}
            />
          </Flex>

          <Box p={3} wordBreak={'break-all'}>
            {feConfigs.ip_whitelist}
          </Box>
        </Box>
      </ModalBody>
    </MyModal>
  );
}

export default ShowShareLinkModal;
