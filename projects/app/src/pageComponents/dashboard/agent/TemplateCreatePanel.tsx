import { getTemplateMarketItemList } from '@/web/core/app/api/template';
import { Box, Flex } from '@chakra-ui/react';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';

const TemplateCreatePanel = () => {
  const { data: templateList = [] } = useRequest2(
    () => getTemplateMarketItemList({ isQuickTemplate: true, type: AppTypeEnum.simple }),
    {
      manual: false,
      refreshDeps: []
    }
  );

  return (
    <Box>
      <Flex mb={5}>
        <Box
          color={'myGray.900'}
          fontSize={'20px'}
          fontWeight={'medium'}
          lineHeight="26px"
          letterSpacing="0.15px"
        >
          从模板新建
        </Box>
      </Flex>

      <Box display={'grid'} gridTemplateColumns={'repeat(4, 1fr) 160px'} gap={4}>
        {templateList.map((item, index) => (
          <Box
            key={index}
            bg={'white'}
            p={4}
            borderRadius={'10px'}
            border={'1px solid'}
            borderColor={'myGray.200'}
            cursor={'pointer'}
            _hover={{
              borderColor: 'primary.500',
              boxShadow: 'md'
            }}
            onClick={() => {
              // TODO: 处理模板点击事件
              console.log('Template clicked:', item);
            }}
          >
            <Flex alignItems={'center'} gap={2} mb={2}>
              <Avatar src={item.avatar} w={'24px'} h={'24px'} borderRadius={'4px'} />
              <Box fontSize={'16px'} fontWeight={'medium'} color={'myGray.900'} noOfLines={1}>
                {item.name}
              </Box>
            </Flex>
            <Box fontSize={'12px'} color={'myGray.500'} noOfLines={1}>
              {item.intro || '这个应用还没写介绍~'}
            </Box>
          </Box>
        ))}

        <Box
          bgImage={'url(/imgs/app/moreTemplateBg.svg)'}
          bgSize={'cover'}
          bgPosition={'center'}
          bgRepeat={'no-repeat'}
          borderRadius={'10px'}
          p={4}
          cursor={'pointer'}
          display={'flex'}
          border={'1px solid'}
          borderColor={'myGray.200'}
          _hover={{
            borderColor: 'primary.500',
            boxShadow: 'md'
          }}
          onClick={() => {
            // TODO: 跳转到模板市场
            // router.push('/app/list');
          }}
        >
          <Box fontSize={'16px'} color={'myGray.600'} fontWeight={'medium'} ml={1}>
            更多
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

export default TemplateCreatePanel;
