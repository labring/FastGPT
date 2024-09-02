import * as moment from 'moment';

class CalculateDeltaNode {
  nodeId: string;
  name: string;
  intro: string;
  avatar: string;
  flowNodeType: string;
  showStatus: boolean;
  version: string;
  inputs: string[];
  outputs: string[];

  constructor(node: any) {
    this.nodeId = node.nodeId;
    this.name = node.name;
    this.intro = node.intro;
    this.avatar = node.avatar;
    this.flowNodeType = node.flowNodeType;
    this.showStatus = node.showStatus;
    this.version = node.version;
    this.inputs = node.inputs;
    this.outputs = node.outputs;
  }

  async processInput(input: any): Promise<any> {
    const storedData = input.storedData;
    const chartData = await this.calculateDelta(storedData);
    return { chartData };
  }

  private async calculateDelta(data: any[]): Promise<any> {
    // 假设数据格式为 [{ date: Date, ca199: number }, ...]
    const sortedData = data.sort((a, b) => a.date.getTime() - b.date.getTime());
    const earliestData = sortedData[0];
    const latestData = sortedData[sortedData.length - 1];

    const delta = latestData.ca199 - earliestData.ca199;
    const changePercentage = ((delta / earliestData.ca199) * 100).toFixed(0);

    const chartData = {
      labels: sortedData.map(d => moment(d.date).format('YYYY-MM-DD')),
      datasets: [{
        label: 'CA199',
        data: sortedData.map(d => d.ca199),
        fill: false,
        borderColor: 'rgb(75, 192, 192)',
        tension: 0.1
      }]
    };

    return {
      delta,
      changePercentage,
      chartData
    };
  }
}

export default CalculateDeltaNode;