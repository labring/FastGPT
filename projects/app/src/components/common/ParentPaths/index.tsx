import MyIcon from '@fastgpt/web/components/common/Icon';
import { Box, Flex } from '@chakra-ui/react';
import { ParentTreePathItemType } from '@fastgpt/global/common/parentFolder/type';
import React, { useMemo } from 'react';
import { useTranslation } from 'next-i18next';

const ParentPaths = (props: {
  paths?: ParentTreePathItemType[];
  rootName?: string;
  FirstPathDom?: React.ReactNode;
  onClick: (parentId: string) => void;
}) => {
  const { t } = useTranslation();
  const { paths = [], rootName = t('common.folder.Root Path'), FirstPathDom, onClick } = props;
  const concatPaths = useMemo(
    () => [
      {
        parentId: '',
        parentName: rootName
      },
      ...paths
    ],
    [rootName, paths]
  );

  return paths.length === 0 && !!FirstPathDom ? (
    <>{FirstPathDom}</>
  ) : (
    <Flex flex={1} ml={-2}>
      {concatPaths.map((item, i) => (
        <Flex key={item.parentId || i} alignItems={'center'}>
          <Box
            fontSize={['sm', 'lg']}
            py={1}
            px={[1, 2]}
            borderRadius={'md'}
            {...(i === concatPaths.length - 1
              ? {
                  cursor: 'default'
                }
              : {
                  cursor: 'pointer',
                  _hover: {
                    bg: 'myGray.100'
                  },
                  onClick: () => {
                    onClick(item.parentId);
                  }
                })}
          >
            {item.parentName}
          </Box>
          {i !== concatPaths.length - 1 && (
            <MyIcon name={'common/rightArrowLight'} color={'myGray.500'} w={'14px'} />
          )}
        </Flex>
      ))}
    </Flex>
  );
};

export default React.memo(ParentPaths);
