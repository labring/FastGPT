import { Box, Flex, type FlexProps } from '@chakra-ui/react';
import MyTag from '@fastgpt/web/components/common/Tag';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useTranslation } from 'next-i18next';
import React from 'react';

type Props = FlexProps & {
  contextToken?: number;
  showVision?: boolean;
  showVideo?: boolean;
  showAudio?: boolean;
  showReasoning?: boolean;
};

const baseCapabilityTagStyles = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  px: '11px',
  py: '1px',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderRadius: '6px',
  fontSize: '12px',
  lineHeight: '16px',
  fontWeight: 400,
  letterSpacing: '0.048px',
  whiteSpace: 'nowrap'
} as const;

const ModelCapabilityTags = ({
  contextToken,
  showVision,
  showVideo,
  showAudio,
  showReasoning,
  ...props
}: Props) => {
  const { t, i18n } = useTranslation();
  const multimodalCapabilities: string[] = [];
  if (showVision) multimodalCapabilities.push(t('common:core.ai.model.capability_image'));
  if (showVideo) multimodalCapabilities.push(t('common:core.ai.model.capability_video'));
  if (showAudio) multimodalCapabilities.push(t('common:core.ai.model.capability_audio'));
  const showMultimodal = multimodalCapabilities.length > 0;
  const multimodalTooltip = t('common:core.ai.model.multimodal_support_tip', {
    modalities: multimodalCapabilities.join(i18n.language === 'en' ? ', ' : '、')
  });

  if (!contextToken && !showMultimodal && !showReasoning) return null;

  return (
    <Flex display={'inline-flex'} alignItems={'center'} gap={'8px'} flexWrap={'nowrap'} {...props}>
      {!!contextToken && (
        <MyTag type="borderFill" colorSchema="blue" py={0.5}>
          {Math.floor(contextToken / 1000)}k
        </MyTag>
      )}
      {showMultimodal && (
        <MyTooltip
          label={multimodalTooltip}
          shouldWrapChildren={false}
          bg={'white'}
          color={'#24282C'}
          px={'12px'}
          py={'8px'}
          borderRadius={'6px'}
          fontSize={'12px'}
          lineHeight={1.5}
          fontWeight={400}
          whiteSpace={'nowrap'}
          boxShadow={
            '0px 2px 4px 0px rgba(161, 167, 179, 0.25), 0px 0px 1px 0px rgba(121, 141, 159, 0.25)'
          }
        >
          <Box
            {...baseCapabilityTagStyles}
            bg={'#F0FBFF'}
            borderColor={'#BCE7FF'}
            color={'#005B9C'}
            cursor={'pointer'}
          >
            {t('common:core.ai.model.multimodal')}
          </Box>
        </MyTooltip>
      )}
      {showReasoning && (
        <Box {...baseCapabilityTagStyles} bg={'#F7F7F7'} borderColor={'#E8EBF0'} color={'#404040'}>
          {t('common:core.ai.model.reasoning_tag')}
        </Box>
      )}
    </Flex>
  );
};

export default React.memo(ModelCapabilityTags);
