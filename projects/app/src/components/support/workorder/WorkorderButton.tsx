import { getWorkorderURL } from '@/web/common/workorder/api';
import { Box, Flex } from '@chakra-ui/react';
import Icon from '@fastgpt/web/components/common/Icon';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useToggle } from 'ahooks';
import { useTranslation } from 'next-i18next';

function WorkorderButton() {
  const [open, setOpen] = useToggle(true);
  const { t } = useTranslation();

  const { data, runAsync } = useRequest2(getWorkorderURL, {
    manual: true
  });

  const onFeedback = async () => {
    await runAsync();
    if (data) {
      window.open(data.redirectUrl);
    }
  };
  return (
    <>
      {open ? (
        <Flex
          position="fixed"
          bottom="20%"
          right="0"
          height="62px"
          width="58px"
          zIndex={100}
          boxShadow="0px 12px 32px -4px #00175633"
          alignItems="center"
          justifyContent="center"
          direction="column"
          borderTopLeftRadius="8px"
          borderBottomLeftRadius="8px"
          border={'1px'}
          borderColor={'#DFE6F2'}
        >
          <Box
            zIndex={101}
            width="14px"
            height="14px"
            position="absolute"
            left="-6px"
            top="-6px"
            borderRadius="full"
            background="white"
            border="1px"
            borderColor={'myGray.25'}
            bgColor="myGray.25"
            _hover={{
              cursor: 'pointer',
              bgColor: 'myGray.100'
            }}
            onClick={() => setOpen.set(false)}
          >
            <Icon name="close" />
          </Box>
          <Flex
            alignItems="center"
            justifyContent="center"
            direction="column"
            bgColor="myGray.25"
            _hover={{
              cursor: 'pointer',
              bgColor: 'myGray.100'
            }}
            width="100%"
            height="100%"
            borderTopLeftRadius="8px"
            borderBottomLeftRadius="8px"
            onClick={onFeedback}
          >
            <Icon name="feedback" width="28px" height="28px" />
            <Box fontSize="11px" fontWeight="500">
              {t('common:question_feedback')}
            </Box>
          </Flex>
        </Flex>
      ) : (
        <Flex
          position="fixed"
          bottom="20%"
          right="0"
          height="44px"
          width="19px"
          bgColor="myGray.25"
          borderTopLeftRadius="8px"
          borderBottomLeftRadius="8px"
          border={'1px'}
          borderColor={'#DFE6F2'}
          zIndex={100}
          boxShadow="0px 12px 32px -4px #00175633"
          alignItems="center"
          justifyContent="center"
          direction="column"
          _hover={{
            cursor: 'pointer',
            bgColor: 'myGray.100'
          }}
          onClick={() => setOpen.set(true)}
        >
          <Icon name="core/chat/chevronLeft" width="16px" height="16px" />
        </Flex>
      )}
    </>
  );
}

export default WorkorderButton;
