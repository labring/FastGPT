import { customAlphabet } from 'nanoid';

/**
 * @param domain : should be like sealosbja.site (secondary domain)
 * @returns CNAME domain: fastgpt-<random_string>.<domain>
 */
export const generateCNAMEDomain = (domain: string): string => {
  const str = customAlphabet('abcdefghijklmnopqrstuvwxyz', 8);
  return `fastgpt-${str()}.${domain}`;
};
