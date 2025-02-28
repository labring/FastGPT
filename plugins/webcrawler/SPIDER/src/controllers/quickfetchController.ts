import { Request, Response } from 'express';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0.3 Safari/605.1.15',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0'
];

export const quickFetch = async (req: Request, res: Response): Promise<void> => {
    const { url } = req.query;

    if (!url) {
        res.status(400).json({
            status: 400,
            error: {
                code: "MISSING_PARAM",
                message: "缺少必要参数: url"
            }
        });
        return;
    }

    try {
        const response = await fetch(url as string, {
            headers: {
                'User-Agent': userAgents[Math.floor(Math.random() * userAgents.length)],
                'Referer': 'https://www.google.com/',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Connection': 'keep-alive',
                'Cache-Control': 'no-cache'
            }
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.text();
        res.status(200).json({
            status: 200,
            data: {
                content: data
            }
        });
    } catch (error) {
        console.error('Error fetching the page:', error);
        res.status(500).json({
            status: 500,
            error: {
                code: "INTERNAL_SERVER_ERROR",
                message: "发生错误"
            }
        });
    }
};

export default { quickFetch };