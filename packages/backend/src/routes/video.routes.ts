import { Router, Request, Response } from 'express';
import config from '../config';
import fs from 'fs';
import mime from 'mime-types';
import { logDebug, logError } from '../utils/logger';

const router = Router();

// Rota para servir o vídeo
router.get('/', (req: Request, res: Response) => {
    logDebug('Requisição de vídeo recebida', { ip: req.ip, range: req.headers.range });
    const videoPath = config.VIDEO_PATH; // Pega do config

    try {
        if (!fs.existsSync(videoPath)) {
            logError(`Erro crítico: VIDEO_PATH (${videoPath}) não existe.`);
            return res.status(404).send("Arquivo de vídeo não encontrado no servidor.");
        }
        const stat = fs.statSync(videoPath);
        const fileSize = stat.size;
        const range = req.headers.range;
        const mimeType = mime.lookup(videoPath) || 'video/mp4'; // Default mime type

        if (range) {
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

            if (start >= fileSize || end >= fileSize || start < 0 || start > end) {
                res.status(416).send('Range Not Satisfiable');
                return;
            }

            const chunksize = (end - start) + 1;
            const file = fs.createReadStream(videoPath, { start, end });
            const head = {
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunksize,
                'Content-Type': mimeType,
            };
            res.writeHead(206, head); // Partial Content
            file.pipe(res);
            file.on('error', (streamErr) => {
                logError("Erro no stream parcial do vídeo:", streamErr);
                if (!res.writableEnded) res.end();
            });
        } else {
            const head = {
                'Content-Length': fileSize,
                'Content-Type': mimeType,
            };
            res.writeHead(200, head); // OK
            const file = fs.createReadStream(videoPath);
            file.pipe(res);
            file.on('error', (streamErr) => {
                logError("Erro no stream completo do vídeo:", streamErr);
                if (!res.writableEnded) res.end();
            });
        }
    } catch (error) {
        logError("Erro ao processar requisição de vídeo:", error);
        if (!res.headersSent) {
            res.status(500).send("Erro ao processar o arquivo de vídeo.");
        } else if (!res.writableEnded) {
            res.end(); // Tenta finalizar se headers já foram enviados
        }
    }
});

export default router;