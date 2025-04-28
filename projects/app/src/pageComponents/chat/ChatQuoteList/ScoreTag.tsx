import { ScoreItemType, scoreTheme } from '@/components/core/dataset/QuoteItem';
import { Box, Flex, Progress } from '@chakra-ui/react';
import { SearchScoreTypeMap } from '@fastgpt/global/core/dataset/constants';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useTranslation } from 'next-i18next';

const ScoreTag = (score: { primaryScore?: ScoreItemType; secondaryScore: ScoreItemType[] }) => {
  const { t } = useTranslation();

  return (
    <Flex alignItems={'center'} flexWrap={'wrap'} gap={3}>
      {score?.primaryScore && (
        <MyTooltip
          label={
            score.secondaryScore.length ? (
              <Flex flexDir={'column'} gap={4}>
                {score.secondaryScore.map((item, i) => (
                  <Box fontSize={'sm'} key={i}>
                    <Flex alignItems={'flex-start'} lineHeight={1.2} mb={1}>
                      <Box
                        px={'5px'}
                        borderWidth={'1px'}
                        borderRadius={'sm'}
                        mr={'2px'}
                        {...(scoreTheme[i] && scoreTheme[i])}
                      >
                        <Box transform={'scale(0.9)'}>#{item.index + 1}</Box>
                      </Box>
                      <Box transform={'scale(0.9)'}>
                        {t(SearchScoreTypeMap[item.type]?.label as any)}: {item.value.toFixed(4)}
                      </Box>
                    </Flex>
                    <Box h={'4px'}>
                      {SearchScoreTypeMap[item.type]?.showScore && (
                        <Progress
                          value={item.value * 100}
                          h={'4px'}
                          w={'100%'}
                          size="sm"
                          borderRadius={'20px'}
                          {...(scoreTheme[i] && {
                            colorScheme: scoreTheme[i].colorScheme
                          })}
                          bg="#E8EBF0"
                        />
                      )}
                    </Box>
                  </Box>
                ))}
              </Flex>
            ) : (
              t(SearchScoreTypeMap[score.primaryScore.type]?.desc as any)
            )
          }
        >
          <Flex
            borderRadius={'sm'}
            py={1}
            px={2}
            color={'green.600'}
            bg={'green.50'}
            alignItems={'center'}
            fontSize={'11px'}
          >
            <Box>
              {t(SearchScoreTypeMap[score.primaryScore.type]?.label as any)}
              {SearchScoreTypeMap[score.primaryScore.type]?.showScore
                ? ` ${score.primaryScore.value.toFixed(4)}`
                : `: ${score.primaryScore.index + 1}`}
            </Box>
          </Flex>
        </MyTooltip>
      )}
    </Flex>
  );
};

export default ScoreTag;
