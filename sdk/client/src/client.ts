import { HttpClient } from './http';
import { Datasets } from './dataset/client';
import type { FastGPTOptions } from './type';

/** FastGPT HTTP SDK。每个实例固定 API Key 和服务地址，可独立用于 Node.js 自动化。 */
export class FastGPT {
  readonly datasets: Datasets;

  constructor(options: FastGPTOptions) {
    this.datasets = new Datasets(new HttpClient(options));
  }
}
