export type PostReRankProps = {
  query: string;
  inputs: { id: string; text: string }[];
};
export type PostReRankResponse = { id: string; score: number }[];
