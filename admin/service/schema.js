import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const mongoUrl = process.env.MONGODB_URI;
const mongoDBName = process.env.MONGODB_NAME;

if (!mongoUrl || !mongoDBName) {
  throw new Error('db error');
}

mongoose
  .connect(mongoUrl, {
    dbName: mongoDBName,
    bufferCommands: true,
    maxPoolSize: 5,
    minPoolSize: 1,
    maxConnecting: 5
  })
  .then(() => console.log('Connected to MongoDB successfully!'))
  .catch((err) => console.log(`Error connecting to MongoDB: ${err}`));

const userSchema = new mongoose.Schema({
  _id: mongoose.Schema.Types.ObjectId,
  username: String,
  password: String,
  balance: Number,
  promotion: {
    rate: Number
  },
  openaiKey: String,
  avatar: String,
  createTime: Date
});

// 新增: 定义 pays 模型
const paySchema = new mongoose.Schema({
  _id: mongoose.Schema.Types.ObjectId,
  userId: mongoose.Schema.Types.ObjectId,
  price: Number,
  orderId: String,
  status: String,
  createTime: Date,
  __v: Number
});

// 新增: 定义 kb 模型
const kbSchema = new mongoose.Schema({
  _id: mongoose.Schema.Types.ObjectId,
  userId: mongoose.Schema.Types.ObjectId,
  avatar: String,
  name: String,
  tags: [String],
  updateTime: Date,
  __v: Number
});

const modelSchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  name: String,
  avatar: String,
  status: String,
  chat: {
    relatedKbs: [mongoose.Schema.Types.ObjectId],
    searchMode: String,
    systemPrompt: String,
    temperature: Number,
    chatModel: String
  },
  share: {
    topNum: Number,
    isShare: Boolean,
    isShareDetail: Boolean,
    intro: String,
    collection: Number
  },
  security: {
    domain: [String],
    contextMaxLen: Number,
    contentMaxLen: Number,
    expiredTime: Number,
    maxLoadAmount: Number
  },
  updateTime: Date
});

const SystemSchema = new mongoose.Schema({
  openAIKeys: {
    type: String,
    default: ''
  },
  openAITrainingKeys: {
    type: String,
    default: ''
  },
  gpt4Key: {
    type: String,
    default: ''
  },
  vectorMaxProcess: {
    type: Number,
    default: 10
  },
  qaMaxProcess: {
    type: Number,
    default: 10
  },
  pgIvfflatProbe: {
    type: Number,
    default: 10
  },
  sensitiveCheck: {
    type: Boolean,
    default: false
  }
});

export const Model = mongoose.models['model'] || mongoose.model('model', modelSchema);
export const Kb = mongoose.models['kb'] || mongoose.model('kb', kbSchema);
export const User = mongoose.models['user'] || mongoose.model('user', userSchema);
export const Pay = mongoose.models['pay'] || mongoose.model('pay', paySchema);
export const System = mongoose.models['system'] || mongoose.model('system', SystemSchema);
