import { SearchScoreTypeEnum } from '../constants';
import { SearchDataResponseItemType } from '../type';

/* dataset search result concat */
export const datasetSearchResultConcat = (
  arr: { k: number; list: SearchDataResponseItemType[] }[]
): SearchDataResponseItemType[] => {
  arr = arr.filter((item) => item.list.length > 0);

  if (arr.length === 0) return [];
  if (arr.length === 1) return arr[0].list;

  const map = new Map<string, SearchDataResponseItemType & { rrfScore: number }>();

  // rrf
  arr.forEach((item) => {
    const k = item.k;

    item.list.forEach((data, index) => {
      const rank = index + 1;
      const score = 1 / (k + rank);

      const record = map.get(data.id);
      if (record) {
        // 合并两个score,有相同type的score,取最大值
        const concatScore = [...record.score];
        for (const dataItem of data.score) {
          const sameScore = concatScore.find((item) => item.type === dataItem.type);
          if (sameScore) {
            sameScore.value = Math.max(sameScore.value, dataItem.value);
          } else {
            concatScore.push(dataItem);
          }
        }

        map.set(data.id, {
          ...record,
          score: concatScore,
          rrfScore: record.rrfScore + score
        });
      } else {
        map.set(data.id, {
          ...data,
          rrfScore: score
        });
      }
    });
  });

  // sort
  const mapArray = Array.from(map.values());
  const results = mapArray.sort((a, b) => b.rrfScore - a.rrfScore);

  return results.map((item, index) => {
    // if SearchScoreTypeEnum.rrf exist, reset score
    const rrfScore = item.score.find((item) => item.type === SearchScoreTypeEnum.rrf);
    if (rrfScore) {
      rrfScore.value = item.rrfScore;
      rrfScore.index = index;
    } else {
      item.score.push({
        type: SearchScoreTypeEnum.rrf,
        value: item.rrfScore,
        index
      });
    }

    // @ts-ignore
    delete item.rrfScore;
    return item;
  });
};
