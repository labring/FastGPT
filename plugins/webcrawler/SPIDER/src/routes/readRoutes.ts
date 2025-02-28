import express from 'express';
import { readPage } from '../controllers/readController';
import authMiddleware from '../middleware/authMiddleware';

const readRoutes = express.Router();

readRoutes.get('/read', authMiddleware, readPage);

export default readRoutes;