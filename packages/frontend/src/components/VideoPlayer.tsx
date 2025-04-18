import { FunctionalComponent } from 'preact';
import { useRef, useEffect } from 'preact/hooks';
import { useTracking } from '../hooks/useTracking';
import styles from './VideoPlayer.module.css';

interface VideoPlayerProps {
    src?: string;
    onErrorChange: (message: string | null) => void;
}

export const VideoPlayer: FunctionalComponent<VideoPlayerProps> = ({ src, onErrorChange }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const {
        handlePlay,
        handlePlaying,
        handlePause,
        handleEnded,
        handleError: handleTrackingError, // Renomeado para evitar conflito com o handler local
        handleSeeked,
    } = useTracking(videoRef);

    // Efeito para lidar com mudança no src
    useEffect(() => {
        if (videoRef.current && src && videoRef.current.src !== src) {
            console.log(`[VideoPlayer] Setting video source to: ${src}`);
            videoRef.current.src = src;
            videoRef.current.load();
            onErrorChange(null); // Limpa erros anteriores ao mudar a fonte
        } else if (videoRef.current && !src) {
            console.warn('[VideoPlayer] No video source provided.');
            if (videoRef.current.src) videoRef.current.src = ''; // Limpa se não houver src
        }
    }, [src, onErrorChange]);

    // Efeito para adicionar e remover listeners de eventos
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        // Handler de erro local que atualiza a UI e chama o hook de tracking
        const onError = () => {
            const error = video.error;
            const errorMessage = `Erro ao carregar vídeo: ${error?.message || 'Desconhecido'} (Code: ${error?.code || 'N/A'})`;
            console.error('[VideoPlayer] Video error event:', error);
            onErrorChange(errorMessage); // Atualiza a UI do componente pai (App)
            handleTrackingError();     // Chama o handler de erro do hook de tracking
        };

        // Adiciona listeners
        video.addEventListener('play', handlePlay);
        video.addEventListener('playing', handlePlaying);
        video.addEventListener('pause', handlePause);
        video.addEventListener('ended', handleEnded);
        video.addEventListener('error', onError); // Usa o handler local
        video.addEventListener('seeked', handleSeeked);

        // Função de cleanup para remover listeners
        return () => {
            video.removeEventListener('play', handlePlay);
            video.removeEventListener('playing', handlePlaying);
            video.removeEventListener('pause', handlePause);
            video.removeEventListener('ended', handleEnded);
            video.removeEventListener('error', onError);
            video.removeEventListener('seeked', handleSeeked);
        };
        // As dependências garantem que os listeners sejam atualizados se os handlers mudarem
    }, [handlePlay, handlePlaying, handlePause, handleEnded, handleTrackingError, handleSeeked, onErrorChange]);


    return (
        <video
            ref={videoRef}
            id="videoPlayerMFE" // ID único se necessário para CSS ou testes
            controls
            playsInline // Essencial para autoplay em mobile (se aplicável)
            preload="metadata" // Carrega metadados (duração, dimensões) sem baixar o vídeo
            className={styles.videoElement}
            // Não definir src aqui, ele é controlado pelo useEffect
        >
            {/* Fallback message */}
            Seu navegador não suporta a tag de vídeo HTML5.
        </video>
    );
};