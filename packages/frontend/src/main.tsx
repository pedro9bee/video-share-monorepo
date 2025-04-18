// packages/frontend/src/main.tsx
import { render } from 'preact';
import register from 'preact-custom-element';
import App from './App'; // Your main Preact component
import { AppProps } from './types'; // Import the props type if needed for dev render

// Register the Preact component as a custom element <video-share>
// This is the primary way the MFE will be consumed in production.
register(
    App,                // The Preact component class/function
    'video-share',      // The HTML tag name for the custom element
    ['message', 'video-src'], // List of attributes to observe and pass as props (kebab-case attributes map to camelCase props)
    { shadow: true }    // Use Shadow DOM for style encapsulation (recommended for MFEs)
);

console.log('[MFE] Custom element "video-share" registered.');

// --- Development Mode Specific Logic ---
// This part allows for direct rendering into a standard div (#app in dev.html)
// during development (`npm run dev`), which enables Preact DevTools and potentially
// better HMR (Hot Module Replacement) experience compared to only using the custom element.
// Vite sets import.meta.env.DEV to true in development.
if (import.meta.env.DEV) {
    const devRootElement = document.getElementById('app');

    if (devRootElement) {
        console.log('[MFE Dev] Development mode detected. Rendering App directly into #app.');

        // Provide default props for direct rendering in dev.html if needed
        // Match the attributes used in dev.html's <video-share> element for consistency
        const devProps: AppProps = {
            message: "Olá do Render Direto (Dev Mode)!",
            videoSrc: "/video" // Use the relative path; Vite's proxy will handle it
        };

        // Render the App component directly into the #app div
        render(<App {...devProps} />, devRootElement);
    } else {
        console.warn('[MFE Dev] Root element #app not found. Direct rendering for development skipped.');
    }
}

// --------------------------------------------------------------------------
// --- IMPORTANT: REMOVE ALL THE OLD VANILLA JAVASCRIPT CODE BELOW THIS LINE ---
//
// The code that was previously here (document.getElementById('videoPlayer'),
// tracking state variables like sessionId, isPlaying, helper functions like
// generateSessionId, sendTrackingData, startTrackingSession, event listeners
// like videoPlayer.addEventListener('play', ...), etc.) is NO LONGER NEEDED
// in this file. That logic is now handled within your Preact components
// (App.tsx, VideoPlayer.tsx) and hooks (useTracking.ts), using Preact's
// state management and lifecycle.
//
// --------------------------------------------------------------------------
