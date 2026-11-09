import { SearchScoreTypeEnum } from '../constants';
import { type SearchDataResponseItemType } from '../type';

/** 重排候选数的边界、步长与默认值；UI 与服务端共用，避免两处漂移。 */
export const rerankCandidateNumRange = {
  min: 10,
  max: 100,
  step: 10,
  default: 100
} as const;

/** 非法值统一收敛：非有限数回退默认值，数值收敛到 [min,max] 的整数。 */
export const normalizeRerankCandidateNum = (value?: number | null) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return rerankCandidateNumRange.default;
  }
  return Math.min(
    rerankCandidateNumRange.max,
    Math.max(rerankCandidateNumRange.min, Math.floor(value))
  );
};

/* dataset search result concat */
export const datasetSearchResultConcat = (
  arr: { weight: number; list: SearchDataResponseItemType[] }[]
): SearchDataResponseItemType[] => {
  arr = arr.filter((item) => item.list.length > 0);

  if (arr.length === 0) return [];
  if (arr.length === 1) return arr[0].list;

  const map = new Map<string, SearchDataResponseItemType & { rrfScore: number }>();

  // rrf
  arr.forEach((item) => {
    const weight = item.weight;

    item.list.forEach((data, index) => {
      const rank = index + 1;
      const score = weight * (1 / (60 + rank));
      const record = map.get(data.id);
      if (record) {
        // 合并两个score,有相同type的score,取最大值
        const concatScore = [...record.score];
        for (const dataItem of data.score) {
          const sameScore = concatScore.find((item) => item.type === dataItem.type);
          if (sameScore) {
            sameScore.value = Math.max(sameScore.value, dataItem.value);
          } else {
            concatScore.push({ ...dataItem });
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
          // score 逐项复制：下面合并取最大值、回写 rrf 分数和名次都只改结果自己的对象，
          // 不能改到调用方传入的列表（重排前的召回快照会和它共用同一批 score 对象）
          score: data.score.map((item) => ({ ...item })),
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

    const { rrfScore: _, ...result } = item;
    return result;
  });
};
