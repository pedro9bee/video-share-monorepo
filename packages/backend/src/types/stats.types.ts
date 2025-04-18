export interface ViewDetails {
  timestamp: string;
  ip?: string;
  userAgent: string;
  referrer: string;
  id: string;
}

export interface ViewDuration {
  sessionId: string;
  duration: number;
  progress: number;
  completed: boolean;
  timestamp: string;
  device: string; // Corresponde a userAgent na ActiveSession
  ip?: string;
}

export interface ActiveSession {
  start: Date;
  lastActive: Date;
  userAgent: string; // 'device' em ViewDuration usa este campo
  language: string;
  screenSize: string;
  ip?: string;
  duration: number;
  progress: number;
  completed: boolean;
}

export interface StatsData {
  videoName: string;
  totalViews: number;
  firstView: string | null;
  lastView: string | null;
  viewDuration: ViewDuration[];
  viewDetails: ViewDetails[];
}

// Interface para o objeto gerenciado em memória (CORRIGIDO)
export interface RuntimeStats extends StatsData {
  activeSessions: { [sessionId: string]: ActiveSession };
}