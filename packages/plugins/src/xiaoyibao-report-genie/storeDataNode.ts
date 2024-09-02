import { MongoClient } from 'mongodb';

class StoreDataNode {
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
    const extractedData = input.extractedData;
    await this.storeData(extractedData);
    return { storedData: "Data stored successfully" };
  }

  private async storeData(data: any): Promise<void> {
    const uri = 'mongodb://localhost:27017'; // MongoDB 连接字符串
    const client = new MongoClient(uri);

    try {
      await client.connect();
      const database = client.db('yourDatabaseName');
      const collection = database.collection('yourCollectionName');

      const document = {
        date: data.date,
        ca199: data.ca199
      };

      await collection.insertOne(document);
    } finally {
      await client.close();
    }
  }
}

export default StoreDataNode;