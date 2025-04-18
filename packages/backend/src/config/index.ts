// packages/backend/src/config/index.ts
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

interface ENV {
  NODE_ENV: string;
  PORT: number;
  VIDEO_PATH: string;
  CUSTOM_MESSAGE: string;
}

interface Config {
  NODE_ENV: string;
  PORT: number;
  VIDEO_PATH: string;
  CUSTOM_MESSAGE: string;
  IS_DEV: boolean;
  IS_PROD: boolean;
  // FRONTEND_DIST_PATH agora é relevante apenas para builds de produção
  FRONTEND_BUILD_PATH_PROD: string; // Renomeado para clareza
}

const getSanitizedEnv = (): ENV => {
  const port = parseInt(process.env.PORT || '3000', 10);
  if (isNaN(port)) {
    console.error('❌ Erro: PORT inválido no .env');
    process.exit(1);
  }

  const videoPath = process.env.VIDEO_PATH;
  if (!videoPath) {
    console.error('❌ Erro: VIDEO_PATH não definido no .env');
    process.exit(1);
  }

  return {
    NODE_ENV: process.env.NODE_ENV || 'production',
    PORT: port,
    VIDEO_PATH: videoPath,
    CUSTOM_MESSAGE: process.env.CUSTOM_MESSAGE || 'Um vídeo especial para você!',
  };
};

const ENV = getSanitizedEnv();
const IS_DEV = ENV.NODE_ENV === 'development';

const config: Config = {
  ...ENV,
  IS_DEV,
  IS_PROD: !IS_DEV,
  // Caminho onde os artefatos de build de PRODUÇÃO do frontend estarão
  FRONTEND_BUILD_PATH_PROD: path.resolve(__dirname, '../../public'),
};

// --- Validar VIDEO_PATH ---
if (!fs.existsSync(config.VIDEO_PATH)) {
    console.error(`❌ Erro: Arquivo de vídeo não encontrado em "${config.VIDEO_PATH}" (definido no .env)`);
    process.exit(1);
}

// --- Nenhuma validação de caminho do frontend necessária aqui para dev ---

export default config;