import { Kb } from '../schema.js';
import { auth } from './system.js';

export const useKbRoute = (app) => {
  // 获取用户知识库列表
  app.get('/kbs', auth(), async (req, res) => {
    try {
      const start = parseInt(req.query._start) || 0;
      const end = parseInt(req.query._end) || 20;
      const order = req.query._order === 'DESC' ? -1 : 1;
      const sort = req.query._sort || '_id';
      const tag = req.query.tag || '';
      const name = req.query.name || '';

      const where = {
        ...(name
          ? {
              name: { $regex: name, $options: 'i' }
            }
          : {}),
        ...(tag
          ? {
              tags: { $elemMatch: { $regex: tag, $options: 'i' } }
            }
          : {})
      };

      const kbsRaw = await Kb.find(where)
        .skip(start)
        .limit(end - start)
        .sort({ [sort]: order });

      const kbs = [];

      for (const kbRaw of kbsRaw) {
        const kb = kbRaw.toObject();

        const orderedKb = {
          id: kb._id.toString(),
          userId: kb.userId,
          name: kb.name,
          tags: kb.tags,
          avatar: kb.avatar
        };

        kbs.push(orderedKb);
      }
      const totalCount = await Kb.countDocuments(where);
      res.header('Access-Control-Expose-Headers', 'X-Total-Count');
      res.header('X-Total-Count', totalCount);
      res.json(kbs);
    } catch (err) {
      console.log(`Error fetching kbs: ${err}`);
      res.status(500).json({ error: 'Error fetching kbs', details: err.message });
    }
  });
};
