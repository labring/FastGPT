import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';

const app = express(); 
app.use(cors()); 
app.use(express.json());

const mongoURI = '';//在这里填入mongodb的连接地址
mongoose.connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('Connected to MongoDB successfully!'))
  .catch((err) => console.log(`Error connecting to MongoDB: ${err}`));

const userSchema = new mongoose.Schema({
  _id: mongoose.Schema.Types.ObjectId,
  username: String,
  password: String,
  balance: Number,
  promotion: {
    rate: Number,
  },
  openaiKey: String,
  avatar: String,
  createTime: Date,
});

// 新增: 定义 pays 模型
const paySchema = new mongoose.Schema({
  _id: mongoose.Schema.Types.ObjectId,
  userId: mongoose.Schema.Types.ObjectId,
  price: Number,
  orderId: String,
  status: String,
  createTime: Date,
  __v: Number,
});

// 新增: 定义 kb 模型
const kbSchema = new mongoose.Schema({
  _id: mongoose.Schema.Types.ObjectId,
  userId: mongoose.Schema.Types.ObjectId,
  avatar: String,
  name: String,
  tags: [String],
  updateTime: Date,
  __v: Number,
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


const Model = mongoose.model('Model', modelSchema);
const Kb = mongoose.model('Kb', kbSchema);
const User = mongoose.model('User', userSchema, 'users');
const Pay = mongoose.model('Pay', paySchema, 'pays');

// 获取用户列表
app.get('/users', async (req, res) => {
  try {
    const start = parseInt(req.query._start) || 0;
    const end = parseInt(req.query._end) || 20;
    const order = req.query._order === 'DESC' ? -1 : 1;
    const sort = req.query._sort || '_id';

    const usersRaw = await User.find()
    .skip(start)
    .limit(end - start)
    .sort({ [sort]: order });
    const users = usersRaw.map((user) => {
      const obj = user.toObject();
      obj.id = obj._id;
      delete obj._id;
      return obj;
    });

    const totalCount = await User.countDocuments();

    res.header('Access-Control-Expose-Headers', 'X-Total-Count');
    res.header('X-Total-Count', totalCount);
    res.json(users);
  } catch (err) {
    console.log(`Error fetching users: ${err}`);
    res.status(500).json({ error: 'Error fetching users' });
  }
});

// 创建用户
app.post('/users', async (req, res) => {
    try {
    const { username, password, balance, promotion, openaiKey = '', avatar = '/icon/human.png' } = req.body;
    if (!username || !password || !balance) {
    return res.status(400).json({ error: 'Invalid user information' });
    }
    const existingUser = await User.findOne({ username });
    if (existingUser) {
    return res.status(400).json({ error: 'Username already exists' });
    }
    const user = new User({
    _id: new mongoose.Types.ObjectId(),
    username,
    password,
    balance,
    promotion: {
    rate: promotion?.rate || 0,
    },
    openaiKey,
    avatar,
    createTime: new Date(),
    });
    const result = await user.save();
    res.json(result);
    } catch (err) {
    console.log(`Error creating user: ${err}`);
    res.status(500).json({ error: 'Error creating user' });
    }
   });
   
   
   
   

// 修改用户信息
app.put('/users/:id', async (req, res) => {
  try {
    const _id = req.params.id;

    const result = await User.updateOne({ _id: _id }, { $set: req.body });
    res.json(result);
  } catch (err) {
    console.log(`Error updating user: ${err}`);
    res.status(500).json({ error: 'Error updating user' });
  }
});

// 删除用户
app.delete('/users/:id', async (req, res) => {
    try {
    const _id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(_id)) {
    return res.status(400).json({ error: 'Invalid user ID' });
    }
    const result = await User.deleteOne({ _id: _id });
    res.json(result);
    } catch (err) {
    console.log(`Error deleting user: ${err}`);
    res.status(500).json({ error: 'Error deleting user' });
    }
   });

// 新增: 获取 pays 列表
app.get('/pays', async (req, res) => {
  try {
    const start = parseInt(req.query._start) || 0;
    const end = parseInt(req.query._end) || 20;
    const order = req.query._order === 'DESC' ? -1 : 1;
    const sort = req.query._sort || '_id';

    const paysRaw = await Pay.find()
    .skip(start)
    .limit(end - start)
    .sort({ [sort]: order });
    
    const usersMap = new Map();
    const pays = [];

    for (const payRaw of paysRaw) {
      const pay = payRaw.toObject();

      if (!usersMap.has(pay.userId.toString())) {
        const user = await User.findById(pay.userId);
        usersMap.set(pay.userId.toString(), user.username);
      }

      const orderedPay = {
        id: pay._id.toString(),
        name: usersMap.get(pay.userId.toString()),
        price: pay.price,
        orderId: pay.orderId,
        status: pay.status,
        createTime: pay.createTime
      };

      pays.push(orderedPay);
    }
    const totalCount = await Pay.countDocuments();
    res.header('Access-Control-Expose-Headers', 'X-Total-Count');
    res.header('X-Total-Count', totalCount);
    res.json(pays);
  } catch (err) {
    console.log(`Error fetching pays: ${err}`);
    res.status(500).json({ error: 'Error fetching pays', details: err.message });
  }
});

// 获取用户知识库列表
app.get('/kbs', async (req, res) => {
  try {
    const start = parseInt(req.query._start) || 0;
    const end = parseInt(req.query._end) || 20;
    const order = req.query._order === 'DESC' ? -1 : 1;
    const sort = req.query._sort || '_id';

    const kbsRaw = await Kb.find()
      .skip(start)
      .limit(end - start)
      .sort({ [sort]: order });

    const usersMap = new Map();
    const kbs = [];

    for (const kbRaw of kbsRaw) {
      const kb = kbRaw.toObject();

      if (!usersMap.has(kb.userId.toString())) {
        const user = await User.findById(kb.userId);
        usersMap.set(kb.userId.toString(), user.username);
      }

      const orderedKb = {
        id: kb._id.toString(),
        user: usersMap.get(kb.userId.toString()),
        name: kb.name,
        tags: kb.tags,
        avatar: kb.avatar
      };

      kbs.push(orderedKb);
    }
    const totalCount = await Kb.countDocuments();
    res.header('Access-Control-Expose-Headers', 'X-Total-Count');
    res.header('X-Total-Count', totalCount);
    res.json(kbs);
  } catch (err) {
    console.log(`Error fetching kbs: ${err}`);
    res.status(500).json({ error: 'Error fetching kbs', details: err.message });
  }
});

// 获取AI助手列表
app.get('/models', async (req, res) => {
  try {
    const start = parseInt(req.query._start) || 0;
    const end = parseInt(req.query._end) || 20;
    const order = req.query._order === 'DESC' ? -1 : 1;
    const sort = req.query._sort || '_id';

    const modelsRaw = await Model.find()
      .skip(start)
      .limit(end - start)
      .sort({ [sort]: order });

    const usersMap = new Map();
    const models = [];

    for (const modelRaw of modelsRaw) {
      const model = modelRaw.toObject();

      if (!usersMap.has(model.userId.toString())) {
        const user = await User.findById(model.userId);
        usersMap.set(model.userId.toString(), user.username);
      }

      // 获取与模型关联的知识库名称
      const kbNames = [];
      for (const kbId of model.chat.relatedKbs) {
        const kb = await Kb.findById(kbId);
        kbNames.push(kb.name);
      }

      const orderedModel = {
        id: model._id.toString(),
        user: usersMap.get(model.userId.toString()),
        name: model.name,
        relatedKbs: kbNames, // 将relatedKbs的id转换为相应的Kb名称
        searchMode: model.chat.searchMode,
        systemPrompt: model.chat.systemPrompt,
        temperature: model.chat.temperature,
        isShare: model.share.isShare,
        isShareDetail: model.share.isShareDetail,
        avatar: model.avatar
      };

      models.push(orderedModel);
    }
    const totalCount = await Model.countDocuments();
    res.header('Access-Control-Expose-Headers', 'X-Total-Count');
    res.header('X-Total-Count', totalCount);
    res.json(models);
  } catch (err) {
    console.log(`Error fetching models: ${err}`);
    res.status(500).json({ error: 'Error fetching models', details: err.message });
  }
});



   
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

