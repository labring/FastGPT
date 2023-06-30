import { User, Pay } from '../schema.js';
import dayjs from 'dayjs';
import { auth } from './system.js';
import crypto from 'crypto';

// 加密
const hashPassword = (psw) => {
  return crypto.createHash('sha256').update(psw).digest('hex');
};

const day = 60;

export const useUserRoute = (app) => {
  // 统计近 30 天注册用户数量
  app.get('/users/data', auth(), async (req, res) => {
    try {
      let startCount = await User.countDocuments({
        createTime: { $lt: new Date(Date.now() - day * 24 * 60 * 60 * 1000) }
      });
      const usersRaw = await User.aggregate([
        { $match: { createTime: { $gte: new Date(Date.now() - day * 24 * 60 * 60 * 1000) } } },
        {
          $group: {
            _id: {
              year: { $year: '$createTime' },
              month: { $month: '$createTime' },
              day: { $dayOfMonth: '$createTime' }
            },
            count: { $sum: 1 }
          }
        },
        {
          $project: {
            _id: 0,
            date: { $dateFromParts: { year: '$_id.year', month: '$_id.month', day: '$_id.day' } },
            count: 1
          }
        },
        { $sort: { date: 1 } }
      ]);

      const countResult = usersRaw.map((item) => {
        const increaseRate = `${((item.count / startCount) * 100).toFixed(2)}%`;
        startCount += item.count;
        return {
          date: item.date,
          count: startCount,
          increase: item.count,
          increaseRate
        };
      });

      res.json(countResult);
    } catch (err) {
      console.log(`Error fetching users: ${err}`);
      res.status(500).json({ error: 'Error fetching users' });
    }
  });
  // 获取用户列表
  app.get('/users', auth(), async (req, res) => {
    try {
      const start = parseInt(req.query._start) || 0;
      const end = parseInt(req.query._end) || 20;
      const order = req.query._order === 'DESC' ? -1 : 1;
      const sort = req.query._sort || 'createTime';
      const username = req.query.username || '';
      const where = {
        username: { $regex: username, $options: 'i' }
      };

      const usersRaw = await User.find(where)
        .skip(start)
        .limit(end - start)
        .sort({ [sort]: order });

      const users = usersRaw.map((user) => {
        const obj = user.toObject();
        return {
          ...obj,
          id: obj._id,
          createTime: dayjs(obj.createTime).format('YYYY/MM/DD HH:mm'),
          password: ''
        };
      });

      const totalCount = await User.countDocuments(where);

      res.header('Access-Control-Expose-Headers', 'X-Total-Count');
      res.header('X-Total-Count', totalCount);
      res.json(users);
    } catch (err) {
      console.log(`Error fetching users: ${err}`);
      res.status(500).json({ error: 'Error fetching users' });
    }
  });
  // 创建用户
  app.post('/users', auth(), async (req, res) => {
    try {
      const { username, password, balance } = req.body;
      if (!username || !password || !balance) {
        return res.status(400).json({ error: 'Invalid user information' });
      }
      const existingUser = await User.findOne({ username });
      if (existingUser) {
        return res.status(400).json({ error: 'Username already exists' });
      }

      const result = await User.create({
        username,
        password,
        balance
      });
      res.json(result);
    } catch (err) {
      console.log(`Error creating user: ${err}`);
      res.status(500).json({ error: 'Error creating user' });
    }
  });

  // 修改用户信息
  app.put('/users/:id', auth(), async (req, res) => {
    try {
      const _id = req.params.id;

      let { password, balance = 0 } = req.body;

      const result = await User.findByIdAndUpdate(_id, {
        ...(password && { password: hashPassword(hashPassword(password)) }),
        ...(balance && { balance })
      });
      res.json(result);
    } catch (err) {
      console.log(`Error updating user: ${err}`);
      res.status(500).json({ error: 'Error updating user' });
    }
  });
  // 新增: 获取 pays 列表
  app.get('/pays', auth(), async (req, res) => {
    try {
      const start = parseInt(req.query._start) || 0;
      const end = parseInt(req.query._end) || 20;
      const order = req.query._order === 'DESC' ? -1 : 1;
      const sort = req.query._sort || '_id';
      const userId = req.query.userId || '';
      const where = userId ? { userId: userId } : {};

      const paysRaw = await Pay.find({
        ...where
      })
        .skip(start)
        .limit(end - start)
        .sort({ [sort]: order });

      const pays = [];

      for (const payRaw of paysRaw) {
        const pay = payRaw.toObject();

        const orderedPay = {
          id: pay._id.toString(),
          userId: pay.userId,
          price: pay.price,
          orderId: pay.orderId,
          status: pay.status,
          createTime: dayjs(pay.createTime).format('YYYY/MM/DD HH:mm')
        };

        pays.push(orderedPay);
      }
      const totalCount = await Pay.countDocuments({
        ...where
      });
      res.header('Access-Control-Expose-Headers', 'X-Total-Count');
      res.header('X-Total-Count', totalCount);
      res.json(pays);
    } catch (err) {
      console.log(`Error fetching pays: ${err}`);
      res.status(500).json({ error: 'Error fetching pays', details: err.message });
    }
  });
  // 获取本月账单
  app.get('/pays/data', auth(), async (req, res) => {
    try {
      let startCount = 0;

      const paysRaw = await Pay.aggregate([
        {
          $match: {
            status: 'SUCCESS',
            createTime: {
              $gte: new Date(Date.now() - day * 24 * 60 * 60 * 1000 + 8 * 60 * 60 * 1000) // 补时差
            }
          }
        },
        {
          $addFields: {
            adjustedCreateTime: { $add: ['$createTime', 8 * 60 * 60 * 1000] }
          }
        },
        {
          $group: {
            _id: {
              year: { $year: '$adjustedCreateTime' },
              month: { $month: '$adjustedCreateTime' },
              day: { $dayOfMonth: '$adjustedCreateTime' }
            },
            count: { $sum: '$price' }
          }
        },
        {
          $project: {
            _id: 0,
            date: { $dateFromParts: { year: '$_id.year', month: '$_id.month', day: '$_id.day' } },
            count: 1
          }
        },
        { $sort: { date: 1 } }
      ]);

      const countResult = paysRaw.map((item) => {
        startCount += item.count;
        return {
          date: item.date,
          total: startCount,
          count: item.count
        };
      });

      res.json(countResult);
    } catch (err) {
      console.log(`Error fetching users: ${err}`);
      res.status(500).json({ error: 'Error fetching users' });
    }
  });
};
