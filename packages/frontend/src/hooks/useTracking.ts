// packages/frontend/src/hooks/useTracking.ts
import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import { sendTrackingData, generateSessionId } from '../services/trackingAPI';
import { TrackingEndpoint, TrackingData } from '../types';

export function useTracking(videoElementRef: preact.RefObject<HTMLVideoElement>) {
    const [sessionId, setSessionId] = useState<string | null>(null);
    const startTimeRef = useRef<Date | null>(null); // Ref to avoid re-renders on update
    const watchDurationRef = useRef<number>(0); // Ref for accumulated time
    const isPlayingRef = useRef<boolean>(false);
    const viewStartedRef = useRef<boolean>(false);
    const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);

    const clearHeartbeat = () => {
        if (heartbeatIntervalRef.current) {
            clearInterval(heartbeatIntervalRef.current);
            heartbeatIntervalRef.current = null;
        }
    };

    // Send data function using the API service
    const sendEvent = useCallback((endpoint: TrackingEndpoint, eventData: Omit<TrackingData, 'sessionId'>) => {
        if (!sessionId) return;
        sendTrackingData(endpoint, { ...eventData, sessionId });
    }, [sessionId]); // Recreate only if sessionId changes

    // Start session
    const startTrackingSession = useCallback(() => {
        if (viewStartedRef.current) return;
        const newSessionId = generateSessionId();
        setSessionId(newSessionId);
        viewStartedRef.current = true;
        console.log(`[useTracking] Starting session: ${newSessionId}`);
        sendTrackingData('start', { // Use sendTrackingData directly here as sessionId state might not be updated yet
            sessionId: newSessionId,
            userAgent: navigator.userAgent,
            language: navigator.language,
            screenSize: `${window.screen.width}x${window.screen.height}`,
            timestamp: new Date().toISOString()
        });
    }, []); // No dependencies needed

    // Update duration logic
    const updateWatchDuration = useCallback(() => {
        if (isPlayingRef.current && startTimeRef.current) {
            const segmentDuration = (new Date().getTime() - startTimeRef.current.getTime()) / 1000;
            watchDurationRef.current += segmentDuration;
            startTimeRef.current = new Date(); // Reset start time for next segment
            console.log(`[useTracking] Accumulated duration: ${watchDurationRef.current.toFixed(2)}s`);
        }
    }, []); // No dependencies

    // Start heartbeat timer
    const startHeartbeat = useCallback(() => {
        clearHeartbeat();
        heartbeatIntervalRef.current = setInterval(() => {
            const video = videoElementRef.current;
            if (isPlayingRef.current && video && video.duration > 0 && !video.paused && !video.ended) {
                const currentPlayDuration = startTimeRef.current ? (new Date().getTime() - startTimeRef.current.getTime()) / 1000 : 0;
                sendEvent('heartbeat', {
                    duration: watchDurationRef.current + currentPlayDuration,
                    progress: video.currentTime / video.duration,
                });
            } else {
                // Stop heartbeat if not playing
               clearHeartbeat();
            }
        }, 30000); // 30 seconds
    }, [sendEvent, videoElementRef]);

    // --- Event Handlers ---

    const handlePlay = useCallback(() => {
        console.log('[useTracking] handlePlay');
        if (!viewStartedRef.current) {
            startTrackingSession();
        }
        if (!isPlayingRef.current) { // Avoid resetting time if resuming from buffer/seek while playing
            isPlayingRef.current = true;
            startTimeRef.current = new Date();
        }
        startHeartbeat();
    }, [startTrackingSession, startHeartbeat]);

    const handlePlaying = useCallback(() => {
         console.log('[useTracking] handlePlaying (resumed)');
         // This ensures tracking resumes if paused due to buffering
         if (!isPlayingRef.current) {
             handlePlay();
         }
    }, [handlePlay]);

    const handlePause = useCallback(() => {
        console.log('[useTracking] handlePause');
        if (!viewStartedRef.current || !isPlayingRef.current) return;

        updateWatchDuration();
        isPlayingRef.current = false;
        clearHeartbeat();

        const video = videoElementRef.current;
        if (video && video.duration > 0) {
            sendEvent('pause', {
                duration: watchDurationRef.current,
                progress: video.currentTime / video.duration,
            });
        }
    }, [updateWatchDuration, sendEvent, videoElementRef]);

    const handleEnded = useCallback(() => {
        console.log('[useTracking] handleEnded');
        if (!viewStartedRef.current) return;

        updateWatchDuration(); // Capture final segment
        isPlayingRef.current = false;
        clearHeartbeat();

        sendEvent('complete', {
            duration: watchDurationRef.current,
            completed: true,
        });
    }, [updateWatchDuration, sendEvent]);

    const handleError = useCallback(() => {
        console.log('[useTracking] handleError');
        const video = videoElementRef.current;
        const error = video?.error;
        if (!viewStartedRef.current) return; // Don't track errors if session hasn't started

        isPlayingRef.current = false;
        clearHeartbeat();
        // Optionally update duration up to the point of error?
        // updateWatchDuration();

        sendEvent('error', {
            errorCode: error?.code ?? 'unknown',
            errorMessage: error?.message ?? 'Unknown video error',
        });
    }, [sendEvent, videoElementRef]);

    const handleSeeked = useCallback(() => {
        const video = videoElementRef.current;
         console.log(`[useTracking] handleSeeked to ${video?.currentTime.toFixed(2)}s`);
         if (!viewStartedRef.current) return;
         // If playing, reset the start time for duration calculation
         if (isPlayingRef.current) {
             startTimeRef.current = new Date();
         }
         // Optionally send a 'seek' event if desired
         // sendEvent('seek', { currentTime: video.currentTime });
    }, []);

    // --- Effect for Unload ---
    useEffect(() => {
        const handleUnload = () => {
             console.log('[useTracking] handleUnload');
            if (!viewStartedRef.current) return;

            updateWatchDuration(); // Capture final time before leaving
            clearHeartbeat();

            const video = videoElementRef.current;
            const progress = (video && video.duration > 0) ? video.currentTime / video.duration : 0;

            // Use sendEvent for consistency (it handles sendBeacon internally)
             sendEvent('exit', {
                 duration: watchDurationRef.current,
                 progress: progress,
             });
        };

        window.addEventListener('beforeunload', handleUnload);

        // Cleanup function: remove listener when component unmounts
        return () => {
             console.log('[useTracking] Cleaning up unload listener');
            window.removeEventListener('beforeunload', handleUnload);
             // Also clear heartbeat on unmount just in case
            clearHeartbeat();
        };
    }, [sendEvent, updateWatchDuration, videoElementRef]); // Ensure dependencies are correct

    // Return handlers to be attached to the video element
    return {
        handlePlay,
        handlePlaying,
        handlePause,
        handleEnded,
        handleError,
        handleSeeked,
        // No need to return state like isPlaying, sessionId etc. unless the UI needs it
    };
}