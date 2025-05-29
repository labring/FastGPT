import { contract } from '../runtime/contract';
import { initClient } from '@ts-rest/core';

export default function createClient(baseUrl: string) {
  return initClient(contract, {
    baseUrl
  });
}
