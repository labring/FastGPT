import * as moment from 'moment'; // 用于日期解析

class ExtractDataNode {
  nodeId: string;
  name: string;
  intro: string;
  avatar: string;
  flowNodeType: string;
  showStatus: boolean;
  version: string;
  inputs: string[];
  outputs: string[];
  process: Record<string, boolean>;

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
    this.process = node.process;
  }

  async processInput(input: any): Promise<any> {
    const result = input.result; // 假设输入是解析结果
    const extractedData = this.extractDateAndCa199(result);
    return extractedData;
  }

  private extractDateAndCa199(result: string): any {
    const dateRegex = /(\d{4}-\d{2}-\d{2})/;
    const ca199Regex = /ca199\s*:\s*(\d+)/i;

    let date = null;
    let ca199 = null;

    // 提取日期
    const dateMatch = result.match(dateRegex);
    if (dateMatch) {
      date = moment(dateMatch[1], 'YYYY-MM-DD').toDate();
    }

    // 提取 ca199
    const ca199Match = result.match(ca199Regex);
    if (ca199Match) {
      ca199 = parseInt(ca199Match[1], 10);
    }

    return { date, ca199 };
  }
}

export default ExtractDataNode;