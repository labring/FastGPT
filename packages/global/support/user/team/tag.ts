export type AuthTeamTagTokenProps = {
  teamId: string;
  teamToken: string;
};

export type AuthTokenFromTeamDomainResponse = {
  success: boolean;
  msg?: string;
  message?: string;
  data: {
    uid: string;
    tags: string[];
  };
};
