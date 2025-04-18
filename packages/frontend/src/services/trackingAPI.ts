import { TrackingData, TrackingEndpoint } from '../types';

// Determina a URL do Backend: VITE_BACKEND_URL ou assume mesma origem
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '';
const IS_DEV = import.meta.env.DEV;

console.log(`[TrackingAPI] Mode: ${IS_DEV ? 'Development' : 'Production'}. Backend URL: '${BACKEND_URL || window.location.origin}'`);

export async function sendTrackingData(endpoint: TrackingEndpoint, data: Omit<TrackingData, 'sessionId'> & { sessionId: string | null }): Promise<void> {
    if (!data.sessionId) {
        console.warn("[TrackingAPI] Session ID missing. Aborting send.");
        return;
    }

    const url = `${BACKEND_URL}/track/${endpoint}`;
    console.log(`[TrackingAPI] Sending '${endpoint}' to: ${url}`);

    if (endpoint === 'exit' && navigator.sendBeacon) {
        try {
            const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
            const sent = navigator.sendBeacon(url, blob);
            console.log(`[TrackingAPI] sendBeacon for 'exit' ${sent ? 'enqueued' : 'failed'}.`);
            if (sent) return;
        } catch (e) {
            console.error("[TrackingAPI] Error using sendBeacon, falling back to fetch:", e);
        }
    }

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
            keepalive: endpoint === 'exit', // Importante para fetch no unload
        });
        if (!response.ok) {
             console.error(`[TrackingAPI] Error sending ${endpoint}: ${response.status} ${response.statusText}`, await response.text().catch(() => ''));
        } else {
            // console.log(`[TrackingAPI] Event '${endpoint}' sent successfully.`); // Pode ser verboso
        }
    } catch (error) {
        console.error(`[TrackingAPI] Network error sending ${endpoint} to ${url}:`, error);
    }
}

export function generateSessionId(): string {
    // Combinação simples para gerar um ID razoavelmente único
    return Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
}