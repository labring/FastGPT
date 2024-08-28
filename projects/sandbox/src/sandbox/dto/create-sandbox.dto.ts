export class RunCodeDto {
  code: string;
  variables: object;
}

export class RunCodeResponse {
  codeReturn: Record<string, any>;
  log: string;
}
