import { FunctionalComponent } from 'preact';
import { useState, useMemo } from 'preact/hooks';
import { VideoPlayer } from './components/VideoPlayer';
import { AppProps } from './types';
import styles from './App.module.css'; // Estilos gerais do App/MFE

// Props recebidas do custom element (definidas em main.tsx)
interface Props extends AppProps {}

const App: FunctionalComponent<Props> = ({ videoSrc: videoSrcAttr, message }) => {
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    // Determina a URL final do vídeo
    const finalVideoSrc = useMemo(() => {
        const backendBaseUrl = import.meta.env.VITE_BACKEND_URL || ''; // Pode ser ""
        // Usa o atributo 'video-src' se fornecido, senão o default '/video'
        const videoPath = videoSrcAttr || '/video';
        // Constrói a URL completa ou relativa
        // Evita barras duplicadas se backendBaseUrl ou videoPath já tiverem
        if (backendBaseUrl && videoPath.startsWith('/')) {
             // Se backendBaseUrl não termina com / e videoPath começa com /
             if (!backendBaseUrl.endsWith('/')) {
                return `${backendBaseUrl}${videoPath}`;
             }
             // Se backendBaseUrl termina com / e videoPath começa com /
             return `${backendBaseUrl}${videoPath.substring(1)}`;
        } else if (backendBaseUrl) {
            // Se backendBaseUrl existe e videoPath não começa com / (improvável, mas seguro)
             return `${backendBaseUrl}/${videoPath}`;
        }
        // Se não há backendBaseUrl, usa o path relativo como está
        return videoPath;
    }, [videoSrcAttr]); // Recalcula apenas se o atributo mudar

    return (
        // Container principal do MFE dentro do Shadow DOM
        <div className={styles.appContainer}>

            {/* Mensagem opcional passada via atributo */}
            {message && (
                <div className={styles.messageBox}>
                    <p>{message}</p>
                </div>
            )}

            {/* Mensagem padrão se nenhuma for passada (opcional) */}
            {!message && (
                 <div className={styles.messageBox}>
                     <p>Vídeo especial carregado!</p> {/* Mensagem Padrão */}
                 </div>
             )}

            {/* Container do Vídeo e Erro */}
            <div className={styles.videoContainer}>
                <VideoPlayer src={finalVideoSrc} onErrorChange={setErrorMessage} />
                {errorMessage && (
                    <div className={styles.errorMessage}>
                        {errorMessage}
                    </div>
                )}
            </div>

            {/* Elementos decorativos podem ser adicionados aqui se fizerem parte do MFE */}
            {/* <div class={styles.bunny}></div> */}
        </div>
    );
};

export default App;