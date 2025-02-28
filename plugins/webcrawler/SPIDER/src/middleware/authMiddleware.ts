import { Request, Response, NextFunction } from 'express';

const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const bearerHeader = req.headers['authorization'];

  if (bearerHeader) {
    console.log("bearerHeader:" + bearerHeader);
    const bearer = bearerHeader.split(' ');
    const bearerToken = bearer[1];

    if (bearerToken === process.env.ACCESS_TOKEN) {
      next();
    } else {
      res.status(403).json({ message: 'Invalid token' });
    }
  } else {
    res.status(401).json({ message: 'Bearer token not found' });
  }
};

export default authMiddleware;