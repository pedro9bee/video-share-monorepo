export interface TrackingEventBase {
  sessionId: string;
}

export interface StartEventData extends TrackingEventBase {
  userAgent: string;
  language: string;
  screenSize: string;
  timestamp: string; // ISO string
}

export interface HeartbeatEventData extends TrackingEventBase {
  duration: number; // seconds
  progress: number; // 0 to 1
}

export interface PauseEventData extends TrackingEventBase {
   duration: number;
   progress: number;
}

export interface CompleteEventData extends TrackingEventBase {
    duration: number;
    completed: boolean;
}

export interface ErrorEventData extends TrackingEventBase {
    errorCode: number | string;
    errorMessage: string;
}

export interface ExitEventData extends TrackingEventBase {
    duration: number;
    progress: number;
}

export type TrackingData = StartEventData | HeartbeatEventData | PauseEventData | CompleteEventData | ErrorEventData | ExitEventData;
export type TrackingEndpoint = 'start' | 'heartbeat' | 'pause' | 'complete' | 'error' | 'exit';

// Props for the main App component, derived from custom element attributes
export interface AppProps {
    videoSrc?: string; // Attribute: video-src
    message?: string;  // Attribute: message
}