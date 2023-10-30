export type CreateTeamProps = {
  ownerId: string;
  name: string;
  avatar?: string;
};
export type UpdateTeamProps = {
  id: string;
  name?: string;
  avatar?: string;
};
export type updateTeamBalanceProps = {
  id: string;
  balance: number;
};

export type CreateTeamMemberProps = {
  ownerId: string;
  teamId: string;
  userId: string;
  name?: string;
};
