import React from 'react';
import { Box, Button, Flex, Textarea } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { SEARCH_TEST_IMAGE_UPLOAD_ENABLED } from '../constants';
import SearchTestImagePreviewList from './SearchTestImagePreviewList';
import type { SearchTestFormType, SearchTestImageRef } from '../type';
import type { UseFormRegister } from 'react-hook-form';

const TestInputPanel = ({
  canSubmit,
  canUseImageSearch,
  datasetMaxToken,
  isLoading,
  onOpenImageSelector,
  onOpenSelectMode,
  onRemoveImage,
  onSubmit,
  queryImageRefs,
  register,
  showSearchTestImageEntry,
  uploadingImageCount
}: {
  canSubmit: boolean;
  canUseImageSearch: boolean;
  datasetMaxToken?: number;
  isLoading: boolean;
  onOpenImageSelector: () => void;
  onOpenSelectMode: () => void;
  onRemoveImage: (key: string) => void;
  onSubmit: () => void;
  queryImageRefs: SearchTestImageRef[];
  register: UseFormRegister<SearchTestFormType>;
  showSearchTestImageEntry: boolean;
  uploadingImageCount: number;
}) => {
  const { t } = useTranslation();

  return (
    <Box
      display={'flex'}
      flexDirection={'column'}
      alignItems={'flex-start'}
      gap={3}
      alignSelf={'stretch'}
    >
      <Flex alignItems={'center'} alignSelf={'stretch'}>
        <Box flex={1} fontWeight={500} color={'myGray.900'}>
          {t('common:core.dataset.test.input_title')}
        </Box>
        <Button
          variant={'whitePrimary'}
          leftIcon={<MyIcon name={'common/settingLight'} w={'14px'} />}
          size={'sm'}
          fontWeight={500}
          onClick={onOpenSelectMode}
        >
          {t('common:core.dataset.test.search_config')}
        </Button>
      </Flex>

      <Box
        border={'1px solid'}
        borderColor={'borderColor.low'}
        p={3}
        borderRadius={'6px'}
        minH={'220px'}
        display={'flex'}
        flexDirection={'column'}
        bg={'white'}
        alignSelf={'stretch'}
        position={'relative'}
      >
        {showSearchTestImageEntry && (
          <SearchTestImagePreviewList
            images={queryImageRefs}
            uploadingCount={uploadingImageCount}
            onRemove={onRemoveImage}
          />
        )}

        <Textarea
          flex={1}
          minH={'140px'}
          resize={'none'}
          variant={'unstyled'}
          py={0}
          fontSize={'sm'}
          lineHeight={'20px'}
          color={'myGray.900'}
          _placeholder={{
            color: 'myGray.400'
          }}
          maxLength={datasetMaxToken}
          placeholder={t('common:core.dataset.test.Test Text Placeholder')}
          {...register('inputText')}
        />

        {SEARCH_TEST_IMAGE_UPLOAD_ENABLED && (
          <MyTooltip
            label={canUseImageSearch ? '' : t('common:core.dataset.test.image_search_disabled_tip')}
          >
            <Box position={'absolute'} left={'12px'} bottom={'8px'}>
              <Box
                as={'button'}
                w={'24px'}
                h={'24px'}
                p={0}
                display={'flex'}
                alignItems={'center'}
                justifyContent={'center'}
                bg={'transparent'}
                border={'none'}
                boxShadow={'none'}
                _hover={{
                  bg: 'transparent'
                }}
                _active={{
                  bg: 'transparent'
                }}
                _disabled={{
                  bg: 'transparent',
                  opacity: 0.5,
                  cursor: 'not-allowed'
                }}
                disabled={!canUseImageSearch}
                onClick={onOpenImageSelector}
                aria-label={t('common:core.dataset.test.upload_image')}
              >
                <MyIcon name={'image'} w={'20px'} h={'20px'} color={'myGray.500'} flexShrink={0} />
              </Box>
            </Box>
          </MyTooltip>
        )}
      </Box>

      <Button
        w={'100%'}
        isLoading={isLoading}
        isDisabled={!canSubmit || uploadingImageCount > 0}
        onClick={onSubmit}
      >
        {t('common:core.dataset.test.Test')}
      </Button>
    </Box>
  );
};

export default React.memo(TestInputPanel);
