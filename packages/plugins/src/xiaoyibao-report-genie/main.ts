import ExtractDataNode from './extractDataNode';
import StoreDataNode from './storeDataNode';
import * as moment from 'moment';

// 定义 JSON 结构中的节点
const nodes = [
  {
    nodeId: "randomNodeId1",
    name: "图片上传并调用大模型 API",
    intro: "将图片的 Base64 URL 发送给指定的大模型 API 地址 (https://api.stepfun.com/v1)，并获取解析结果。",
    avatar: "/imgs/workflow/input.png",
    flowNodeType: "pluginInput",
    showStatus: false,
    version: "481",
    inputs: [],
    outputs: ["result"],
    apiUrl: "https://api.stepfun.com/v1",
    method: "POST",
    headers: {},
    body: {
      model: "step-1v-8k",
      messages: [
        {
          role: "system",
          content: "你是由阶跃星辰提供的AI聊天助手，你除了擅长中文，英文，以及多种其他语言的对话以外，还能够根据用户提供的图片，对内容进行精准的内容文本描述。在保证用户数据安全的前提下，你能对用户的问题和请求，作出快速和精准的回答。同时，你的回答和建议应该拒绝黄赌毒，暴力恐怖主义的内容"
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "用优雅的语言描述这张图片"
            },
            {
              type: "image_url",
              image_url: {
                url: "data:image/webp;base64,\${input.base64Url}"
              }
            }
          ]
        }
      ]
    }
  },
  {
    nodeId: "randomNodeId2",
    name: "处理解析结果",
    intro: "处理从大模型 API 返回的解析结果，并提取日期和 ca199 变量值。",
    avatar: "/imgs/workflow/output.png",
    flowNodeType: "pluginOutput",
    showStatus: false,
    version: "481",
    inputs: ["result"],
    outputs: ["extractedData"],
    process: {
      extractDateAndCa199: true
    }
  },
  {
    nodeId: "randomNodeId3",
    name: "存储数据到 MongoDB",
    intro: "将提取的数据存储到 MongoDB 中。",
    avatar: "/imgs/workflow/output.png",
    flowNodeType: "pluginOutput",
    showStatus: false,
    version: "481",
    inputs: ["extractedData"],
    outputs: ["storedData"]
  }
];

// 实例化并使用 ExtractDataNode 和 StoreDataNode
(async () => {
  const nodeConfig1 = nodes.find(node => node.nodeId === "randomNodeId1");
  const nodeConfig2 = nodes.find(node => node.nodeId === "randomNodeId2");
  const nodeConfig3 = nodes.find(node => node.nodeId === "randomNodeId3");

  const node1 = new ExtractDataNode(nodeConfig1);
  const node2 = new ExtractDataNode(nodeConfig2);
  const node3 = new StoreDataNode(nodeConfig3);

  const input1 = {
    result: "2023-09-15, ca199: 123" // 示例输入
  };

  // 处理第一个节点
  const result1 = await node1.processInput(input1);
  console.log("Extracted Data:", result1);

  // 处理第二个节点
  const result2 = await node2.processInput({ result: result1 });
  console.log("Extracted Data:", result2);

  // 存储数据到 MongoDB
  const result3 = await node3.processInput({ extractedData: result2 });
  console.log("Stored Data:", result3);
})();