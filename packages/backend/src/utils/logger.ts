import config from '../config';

const getTimestamp = (): string => new Date().toISOString();

export const logInfo = (...args: any[]): void => {
  console.log(`[INFO ${getTimestamp()}]`, ...args);
};

export const logDebug = (...args: any[]): void => {
  if (config.IS_DEV) {
    console.log(`[DEBUG ${getTimestamp()}]`, ...args);
  }
};

export const logWarn = (...args: any[]): void => {
  console.warn(`[WARN ${getTimestamp()}]`, ...args);
};

export const logError = (...args: any[]): void => {
  console.error(`[ERROR ${getTimestamp()}]`, ...args);
};