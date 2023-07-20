import jwt from 'jsonwebtoken';
import { System } from '../schema.js';

const adminAuth = {
  username: process.env.ADMIN_USER,
  password: process.env.ADMIN_PASS
};
const authSecret = process.env.ADMIN_SECRET;

const postParent = () => {
  fetch(`${process.env.PARENT_URL}/api/system/updateEnv`, {
    headers: {
      rootkey: process.env.PARENT_ROOT_KEY
    }
  });
};

export const useSystemRoute = (app) => {
  app.post('/api/login', (req, res) => {
    if (!adminAuth.username || !adminAuth.password) {
      res.status(401).end('Server not set env: ADMIN_USER, ADMIN_PASS');
      return;
    }

    const { username, password } = req.body;

    if (username === adminAuth.username && password === adminAuth.password) {
      // 用户名和密码都正确，返回token
      const token = jwt.sign(
        {
          username,
          platform: 'admin'
        },
        authSecret,
        {
          expiresIn: '2h'
        }
      );

      res.json({
        username,
        token: token,
        expiredAt: new Date().valueOf() + 2 * 60 * 60 * 1000
      });
    } else {
      res.status(401).end('username or password incorrect');
    }
  });
};

export const auth = () => {
  return (req, res, next) => {
    try {
      const authorization = req.headers.authorization;
      if (!authorization) {
        return next(new Error('unAuthorization'));
      }

      const token = authorization.slice('Bearer '.length);

      const payload = jwt.verify(token, authSecret);
      if (typeof payload === 'string') {
        res.status(401).end('payload type error');
        return;
      }
      if (payload.platform !== 'admin') {
        res.status(401).end('Payload invalid');
        return;
      }

      next();
    } catch (err) {
      res.status(401).end(String(err));
    }
  };
};
