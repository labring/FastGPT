export type KbUpdateParams = {
  id: string;
  name: string;
  tags: string;
  avatar: string;
};
export type CreateKbParams = {
  name: string;
  tags: string[];
  avatar: string;
  vectorModel: string;
};
