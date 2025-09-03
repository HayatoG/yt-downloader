'use client';

import { useState, useRef, useEffect } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

interface VideoFormat {
  quality: string;
  container: string;
  downloadUrl: string;
  fileSize?: string;
  hasAudio: boolean;
  hasVideo: boolean;
}

interface VideoInfo {
  title: string;
  duration: string;
  thumbnail: string;
  formats: VideoFormat[];
}

interface CombineJob {
  id: string;
  videoFormat: VideoFormat;
  audioFormat: VideoFormat;
  status: 'preparing' | 'downloading' | 'processing' | 'completed' | 'error';
  progress: number;
  error?: string;
  logs: string[];
  fileName?: string;
}

export default function Home() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [error, setError] = useState('');
  const [combineJobs, setCombineJobs] = useState<CombineJob[]>([]);
  const [ffmpegLoaded, setFfmpegLoaded] = useState(false);
  const [ffmpegLoading, setFfmpegLoading] = useState(false);
  const [downloadingFormats, setDownloadingFormats] = useState<Set<string>>(new Set());

  const ffmpegRef = useRef<FFmpeg | null>(null);

  // Função helper para adicionar logs a um job
  const addJobLog = (jobId: string, message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    const logMessage = `[${timestamp}] ${message}`;
    console.log(logMessage);

    setCombineJobs(prev => prev.map(job =>
      job.id === jobId ? {
        ...job,
        logs: [...job.logs, logMessage]
      } : job
    ));
  };

  // Inicializar FFmpeg apenas no cliente
  useEffect(() => {
    if (typeof window !== 'undefined') {
      ffmpegRef.current = new FFmpeg();
    }
  }, []);

  // Carregar FFmpeg
  const loadFFmpeg = async () => {
    if (ffmpegLoaded || !ffmpegRef.current) return;

    setFfmpegLoading(true);
    try {
      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
      const ffmpeg = ffmpegRef.current;

      ffmpeg.on('log', ({ message }) => {
        console.log(message);
      });

      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      });

      setFfmpegLoaded(true);
    } catch (error) {
      console.error('Erro ao carregar FFmpeg:', error);
      setError('Erro ao carregar processador de vídeo');
    } finally {
      setFfmpegLoading(false);
    }
  };

  // Inicializar FFmpeg quando o componente montar
  useEffect(() => {
    loadFFmpeg();
  }, []);

  // Função para combinar vídeo e áudio
  const combineVideoAudio = async (videoFormat: VideoFormat, audioFormat: VideoFormat) => {
    if (!ffmpegLoaded || !ffmpegRef.current) {
      await loadFFmpeg();
    }

    if (!ffmpegRef.current) {
      setError('Erro ao inicializar processador de vídeo');
      return;
    }

    const jobId = Date.now().toString();
    const fileName = `${videoInfo?.title?.replace(/[^a-zA-Z0-9\s\-_]/g, '') || 'video'}_${videoFormat.quality}_com_audio.mp4`;

    const newJob: CombineJob = {
      id: jobId,
      videoFormat,
      audioFormat,
      status: 'preparing',
      progress: 0,
      logs: [],
      fileName
    };

    setCombineJobs(prev => [...prev, newJob]);

    addJobLog(jobId, `🎬 Iniciando combinação: ${videoFormat.quality} + Áudio`);
    addJobLog(jobId, `📁 Vídeo: ${videoFormat.container} (${videoFormat.fileSize || 'tamanho desconhecido'})`);
    addJobLog(jobId, `🎵 Áudio: ${audioFormat.container} (${audioFormat.fileSize || 'tamanho desconhecido'})`);
    addJobLog(jobId, `💾 Arquivo final: ${fileName}`);

    try {
      const ffmpeg = ffmpegRef.current;

      // Configurar listener para progresso do FFmpeg
      ffmpeg.on('progress', ({ progress }) => {
        if (progress > 0) {
          const adjustedProgress = Math.min(50 + (progress * 40), 90);
          setCombineJobs(prev => prev.map(job =>
            job.id === jobId ? { ...job, progress: adjustedProgress } : job
          ));
        }
      });

      // Atualizar status: baixando arquivos
      addJobLog(jobId, '⬇️ Iniciando downloads dos arquivos...');
      setCombineJobs(prev => prev.map(job =>
        job.id === jobId ? { ...job, status: 'downloading', progress: 5 } : job
      ));

      // Função helper para baixar usando proxy
      const downloadWithProxy = async (url: string, type: 'vídeo' | 'áudio', retries = 2): Promise<Uint8Array> => {
        for (let attempt = 1; attempt <= retries; attempt++) {
          try {
            addJobLog(jobId, `📥 Baixando ${type}... (tentativa ${attempt}/${retries})`);

            // Usar proxy para contornar CORS
            const proxyUrl = `/api/proxy?url=${encodeURIComponent(url)}`;
            const response = await fetch(proxyUrl);

            if (!response.ok) {
              throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const arrayBuffer = await response.arrayBuffer();
            const data = new Uint8Array(arrayBuffer);

            addJobLog(jobId, `✅ ${type} baixado: ${(data.byteLength / (1024 * 1024)).toFixed(1)} MB`);
            return data;

          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Erro desconhecido';
            addJobLog(jobId, `⚠️ Erro na tentativa ${attempt}: ${errorMsg}`);

            if (attempt === retries) {
              throw new Error(`Falha ao baixar ${type} após ${retries} tentativas: ${errorMsg}`);
            }

            // Aguardar um pouco antes da próxima tentativa
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
          }
        }
        throw new Error(`Falha ao baixar ${type}`);
      };

      // Baixar vídeo usando proxy
      addJobLog(jobId, '📥 Iniciando download do vídeo...');
      const videoData = await downloadWithProxy(videoFormat.downloadUrl, 'vídeo');

      setCombineJobs(prev => prev.map(job =>
        job.id === jobId ? { ...job, progress: 25 } : job
      ));

      // Baixar áudio usando proxy
      addJobLog(jobId, '🎵 Iniciando download do áudio...');
      const audioData = await downloadWithProxy(audioFormat.downloadUrl, 'áudio');

      // Atualizar status: processando
      addJobLog(jobId, '⚙️ Preparando processamento...');
      setCombineJobs(prev => prev.map(job =>
        job.id === jobId ? { ...job, status: 'processing', progress: 45 } : job
      ));

      // Escrever arquivos no sistema de arquivos virtual do FFmpeg
      addJobLog(jobId, '💾 Carregando arquivos no processador...');

      // Usar extensões corretas baseadas no container
      const videoExt = videoFormat.container === 'webm' ? 'webm' : 'mp4';
      const audioExt = audioFormat.container === 'webm' ? 'webm' : audioFormat.container === 'm4a' ? 'm4a' : 'mp4';

      await ffmpeg.writeFile(`video.${videoExt}`, videoData);
      await ffmpeg.writeFile(`audio.${audioExt}`, audioData);

      addJobLog(jobId, `📁 Arquivos carregados: video.${videoExt} e audio.${audioExt}`);

      // Executar comando FFmpeg para combinar com configurações otimizadas
      addJobLog(jobId, '🔗 Combinando vídeo e áudio...');
      setCombineJobs(prev => prev.map(job =>
        job.id === jobId ? { ...job, progress: 50 } : job
      ));

      // Comando FFmpeg otimizado para melhor compatibilidade
      const command = [
        '-i', `video.${videoExt}`,
        '-i', `audio.${audioExt}`,
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-movflags', '+faststart',
        '-shortest',
        '-y',  // Sobrescrever arquivo de saída
        'output.mp4'
      ];

      addJobLog(jobId, `🎮 Executando: ffmpeg ${command.join(' ')}`);
      await ffmpeg.exec(command);

      // Atualizar progresso
      addJobLog(jobId, '📦 Finalizando arquivo...');
      setCombineJobs(prev => prev.map(job =>
        job.id === jobId ? { ...job, progress: 90 } : job
      ));

      // Ler arquivo combinado
      const combinedData = await ffmpeg.readFile('output.mp4');
      addJobLog(jobId, `📊 Arquivo final gerado: ${((combinedData as Uint8Array).byteLength / (1024 * 1024)).toFixed(1)} MB`);

      // Criar blob e download
      const blob = new Blob([combinedData as any], { type: 'video/mp4' });
      const url = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Limpar URL
      URL.revokeObjectURL(url);

      // Limpar arquivos temporários
      try {
        await ffmpeg.deleteFile(`video.${videoExt}`);
        await ffmpeg.deleteFile(`audio.${audioExt}`);
        await ffmpeg.deleteFile('output.mp4');
        addJobLog(jobId, '🧹 Arquivos temporários removidos');
      } catch (cleanupError) {
        console.warn('Erro ao limpar arquivos temporários:', cleanupError);
      }

      // Atualizar status: concluído
      addJobLog(jobId, '🎉 Combinação concluída com sucesso!');
      addJobLog(jobId, `💾 Download iniciado: ${fileName}`);
      setCombineJobs(prev => prev.map(job =>
        job.id === jobId ? { ...job, status: 'completed', progress: 100 } : job
      ));

      // Remover job após 10 segundos
      setTimeout(() => {
        setCombineJobs(prev => prev.filter(job => job.id !== jobId));
      }, 10000);

    } catch (error) {
      console.error('Erro ao combinar vídeo e áudio:', error);

      let errorMessage = 'Erro desconhecido';
      if (error instanceof Error) {
        if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
          errorMessage = 'Erro de conectividade. Verifique sua conexão com a internet e tente novamente.';
        } else if (error.message.includes('Falha ao baixar') || error.message.includes('HTTP 403')) {
          errorMessage = 'URL do YouTube expirada ou bloqueada. Tente obter as informações do vídeo novamente.';
        } else if (error.message.includes('HTTP 404')) {
          errorMessage = 'Arquivo não encontrado. O vídeo pode ter sido removido ou estar indisponível.';
        } else if (error.message.includes('HTTP 429')) {
          errorMessage = 'Muitas requisições. Aguarde alguns minutos antes de tentar novamente.';
        } else if (error.message.includes('CORS')) {
          errorMessage = 'Erro de política de origem cruzada. Tentando método alternativo...';
        } else if (error.message.includes('ffmpeg') || error.message.includes('codec')) {
          errorMessage = 'Erro no processamento de vídeo. Tente um formato diferente ou com qualidade menor.';
        } else if (error.message.includes('tentativas')) {
          errorMessage = error.message; // Usar mensagem específica do sistema de retry
        } else {
          errorMessage = `Erro: ${error.message}`;
        }
      }

      addJobLog(jobId, `❌ Erro: ${errorMessage}`);
      setCombineJobs(prev => prev.map(job =>
        job.id === jobId ? {
          ...job,
          status: 'error',
          error: errorMessage
        } : job
      ));

      // Tentar limpar arquivos mesmo em caso de erro
      try {
        const ffmpeg = ffmpegRef.current;
        if (ffmpeg) {
          await ffmpeg.deleteFile('video.mp4');
          await ffmpeg.deleteFile('video.webm');
          await ffmpeg.deleteFile('audio.mp4');
          await ffmpeg.deleteFile('audio.webm');
          await ffmpeg.deleteFile('audio.m4a');
          await ffmpeg.deleteFile('output.mp4');
        }
      } catch (cleanupError) {
        console.warn('Erro ao limpar arquivos após falha:', cleanupError);
      }

      // Remover job com erro após 30 segundos
      setTimeout(() => {
        setCombineJobs(prev => prev.filter(job => job.id !== jobId));
      }, 30000);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!url.trim()) {
      setError('Por favor, insira uma URL válida do YouTube');
      return;
    }

    setLoading(true);
    setError('');
    setVideoInfo(null);

    try {
      const response = await fetch('/api/download', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: url.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao processar vídeo');
      }

      setVideoInfo(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  };

  const [selectedFormat, setSelectedFormat] = useState<VideoFormat | null>(null);

  const handleDownload = async (format: VideoFormat) => {
    if (!format?.downloadUrl) return;

    const formatKey = `${format.quality}-${format.container}`;

    // Verificar se já está baixando
    if (downloadingFormats.has(formatKey)) return;

    try {
      // Adicionar ao conjunto de downloads em andamento
      setDownloadingFormats(prev => new Set(prev).add(formatKey));

      // Criar nome do arquivo seguro
      const safeTitle = videoInfo?.title?.replace(/[^a-zA-Z0-9\s\-_]/g, '') || 'video';
      const fileName = `${safeTitle}_${format.quality}.${format.container}`;

      console.log(`Iniciando download de ${format.quality} (${format.container})`);

      // Primeiro tentar download direto (funciona melhor para alguns formatos)
      try {
        const link = document.createElement('a');
        link.href = format.downloadUrl;
        link.download = fileName;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.style.display = 'none'; // Teste

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        console.log(`Download direto iniciado para ${format.quality}`);

      } catch (directError) {
        console.log(`Download direto falhou para ${format.quality}, tentando via proxy:`, directError);

        // Fallback: usar proxy para formatos que precisam
        const proxyUrl = `/api/proxy?url=${encodeURIComponent(format.downloadUrl)}`;

        const link = document.createElement('a');
        link.href = proxyUrl;
        link.download = fileName;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.style.display = 'none'; document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        console.log(`Download via proxy iniciado para ${format.quality}`);
      }

    } catch (error) {
      console.error('Erro ao baixar arquivo:', error);
      setError(`Erro ao baixar ${format.quality}: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    } finally {
      // Remover do conjunto de downloads em andamento após um delay
      setTimeout(() => {
        setDownloadingFormats(prev => {
          const newSet = new Set(prev);
          newSet.delete(formatKey);
          return newSet;
        });
      }, 3000); // Aumentei para dar tempo do download iniciar
    }
  };  // Função para baixar vídeo + áudio separadamente
  const handleDownloadVideoAndAudio = async (videoFormat: VideoFormat) => {
    if (!videoInfo) return;

    try {
      // Encontrar o melhor formato de áudio
      const audioFormat = videoInfo.formats.find(f => f.hasAudio && !f.hasVideo);

      if (!audioFormat) {
        setError('Nenhum formato de áudio encontrado');
        return;
      }

      // Baixar vídeo
      await handleDownload(videoFormat);

      // Aguardar um pouco e baixar áudio
      setTimeout(async () => {
        await handleDownload(audioFormat);
      }, 1000);

    } catch (error) {
      console.error('Erro ao baixar vídeo e áudio:', error);
      setError(`Erro ao baixar vídeo e áudio: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    }
  }; const formatDuration = (seconds: string) => {
    const mins = Math.floor(parseInt(seconds) / 60);
    const secs = parseInt(seconds) % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900">
      {/* Background Pattern */}
      <div className="absolute inset-0 bg-black bg-opacity-50"></div>
      <div className="absolute inset-0" style={{
        backgroundImage: `radial-gradient(circle at 25% 25%, rgba(120, 119, 198, 0.3) 0%, transparent 50%), 
                         radial-gradient(circle at 75% 75%, rgba(255, 119, 198, 0.3) 0%, transparent 50%)`
      }}></div>

      <div className="relative z-10 flex items-center justify-center min-h-screen p-4">
        <div className="max-w-7xl w-full">
          {/* Header */}
          <div className="text-center mb-12">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-r from-red-500 to-red-600 rounded-full mb-6 shadow-2xl">
              <svg className="w-10 h-10 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z" />
              </svg>
            </div>
            <h1 className="text-5xl md:text-6xl font-bold bg-gradient-to-r from-white via-gray-100 to-gray-300 bg-clip-text text-transparent mb-4">
              YouTube Downloader
            </h1>
            <p className="text-xl text-gray-300 max-w-3xl mx-auto">
              Baixe vídeos e combine com áudio usando processamento local. Rápido, seguro e privado.
            </p>
          </div>

          {/* Main Card */}
          <div className="bg-white/10 backdrop-blur-lg rounded-3xl border border-white/20 shadow-2xl p-8 mb-8">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label htmlFor="url" className="block text-sm font-medium text-gray-200 mb-3">
                  🔗 URL do YouTube
                </label>
                <div className="relative">
                  <input
                    type="url"
                    id="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=dQw4w9WgXcQ"
                    className="w-full px-6 py-4 bg-white/10 backdrop-blur border border-white/30 rounded-2xl focus:ring-2 focus:ring-red-500 focus:border-transparent text-white placeholder-gray-400 text-lg"
                    disabled={loading}
                  />
                  <div className="absolute inset-y-0 right-0 flex items-center pr-6">
                    <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 disabled:from-gray-500 disabled:to-gray-600 text-white font-bold py-4 px-8 rounded-2xl transition-all duration-300 transform hover:scale-[1.02] hover:shadow-2xl flex items-center justify-center space-x-3 text-lg"
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
                    <span>Analisando vídeo...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <span>Obter Informações do Vídeo</span>
                  </>
                )}
              </button>
            </form>
          </div>

          {error && (
            <div className="bg-red-500/20 backdrop-blur border border-red-500/50 text-red-100 rounded-2xl p-6 mb-8">
              <div className="flex items-center space-x-3">
                <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="font-medium">{error}</span>
              </div>
            </div>
          )}

          {/* Jobs de Combinação Ativos */}
          {combineJobs.length > 0 && (
            <div className="bg-white/10 backdrop-blur-lg rounded-3xl border border-white/20 shadow-2xl p-8 mb-8">
              <h4 className="text-2xl font-bold text-white mb-6 flex items-center space-x-3">
                <span className="text-3xl">🎬</span>
                <span>Processamento de Vídeos</span>
              </h4>
              <div className="space-y-6">
                {combineJobs.map((job) => (
                  <div key={job.id} className="bg-white/10 backdrop-blur border border-white/20 rounded-2xl p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center space-x-3">
                        <div className="w-3 h-3 rounded-full bg-gradient-to-r from-purple-400 to-pink-400 animate-pulse"></div>
                        <span className="font-bold text-white text-lg">
                          {job.videoFormat.quality} + Áudio
                        </span>
                      </div>
                      <div className="flex items-center space-x-2">
                        {job.status === 'preparing' && <span className="text-blue-300">🔄 Preparando...</span>}
                        {job.status === 'downloading' && <span className="text-yellow-300">⬇️ Baixando arquivos...</span>}
                        {job.status === 'processing' && <span className="text-purple-300">⚙️ Combinando vídeo e áudio...</span>}
                        {job.status === 'completed' && <span className="text-green-300">✅ Concluído!</span>}
                        {job.status === 'error' && <span className="text-red-300">❌ Erro</span>}
                      </div>
                    </div>

                    {job.fileName && (
                      <div className="mb-3 text-sm text-gray-300">
                        📁 {job.fileName}
                      </div>
                    )}

                    {/* Barra de Progresso Aprimorada */}
                    <div className="relative w-full bg-white/20 rounded-full h-3 mb-4 overflow-hidden">
                      <div
                        className={`h-3 rounded-full transition-all duration-500 ease-out relative ${job.status === 'error' ? 'bg-gradient-to-r from-red-500 to-red-600' :
                          job.status === 'completed' ? 'bg-gradient-to-r from-green-500 to-green-600' :
                            'bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500'
                          }`}
                        style={{ width: `${job.progress}%` }}
                      >
                        <div className="absolute inset-0 bg-white/30 animate-pulse"></div>
                      </div>
                    </div>

                    <div className="flex justify-between text-sm text-gray-300 mb-4">
                      <span className="font-medium">{job.progress}%</span>
                      {job.error && <span className="text-red-400 font-medium">{job.error}</span>}
                    </div>

                    {/* Logs Aprimorados */}
                    {job.logs.length > 0 && (
                      <div className="mt-4">
                        <details className="group">
                          <summary className="cursor-pointer text-sm font-medium text-gray-300 hover:text-white transition-colors flex items-center space-x-2">
                            <svg className="w-4 h-4 transform group-open:rotate-90 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                            <span>📋 Ver logs detalhados ({job.logs.length} entradas)</span>
                          </summary>
                          <div className="mt-3 max-h-48 overflow-y-auto bg-black/30 backdrop-blur rounded-xl p-4">
                            {job.logs.map((log, index) => (
                              <div key={index} className="text-xs font-mono text-gray-300 py-1 border-b border-gray-700/50 last:border-b-0">
                                {log}
                              </div>
                            ))}
                          </div>
                        </details>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Status do FFmpeg Aprimorado */}
          {ffmpegLoading && (
            <div className="bg-blue-500/20 backdrop-blur border border-blue-500/50 rounded-2xl p-6 mb-8">
              <div className="flex items-center space-x-4">
                <div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-400 border-t-transparent"></div>
                <div>
                  <div className="text-blue-100 font-medium">Carregando processador de vídeo...</div>
                  <div className="text-blue-200 text-sm">Isso pode levar alguns segundos na primeira vez</div>
                </div>
              </div>
            </div>
          )}

          {ffmpegLoaded && !ffmpegLoading && (
            <div className="bg-green-500/20 backdrop-blur border border-green-500/50 rounded-2xl p-6 mb-8">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <div className="text-green-100 font-medium">Processador de vídeo carregado!</div>
                  <div className="text-green-200 text-sm">Combinação de áudio e vídeo disponível</div>
                </div>
              </div>
            </div>
          )}

          {/* Informações do Vídeo */}
          {videoInfo && (
            <div className="bg-white/10 backdrop-blur-lg rounded-3xl border border-white/20 shadow-2xl p-8">
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                {/* Thumbnail e Info Básica */}
                <div className="xl:col-span-1">
                  <img
                    src={videoInfo.thumbnail}
                    alt={videoInfo.title}
                    className="w-full h-48 md:h-64 object-cover rounded-2xl shadow-xl mb-6"
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white/10 rounded-xl p-4 text-center">
                      <div className="text-gray-300 text-sm mb-1">Duração</div>
                      <div className="text-white font-bold text-xl">{formatDuration(videoInfo.duration)}</div>
                    </div>
                    <div className="bg-white/10 rounded-xl p-4 text-center">
                      <div className="text-gray-300 text-sm mb-1">Formatos</div>
                      <div className="text-white font-bold text-xl">{videoInfo.formats.length}</div>
                    </div>
                  </div>
                </div>

                {/* Título e Lista de Formatos */}
                <div className="xl:col-span-2">
                  <h3 className="font-bold text-2xl md:text-3xl text-white mb-6 leading-tight">
                    {videoInfo.title}
                  </h3>

                  <h4 className="font-bold text-xl text-white mb-6 flex items-center space-x-2">
                    <span>📥</span>
                    <span>Escolha o tipo de download:</span>
                  </h4>

                  <div className="space-y-8 max-h-96 overflow-y-auto pr-2">
                    {/* Formatos com Áudio + Vídeo */}
                    {videoInfo.formats.filter(f => f.hasAudio && f.hasVideo).length > 0 && (
                      <div>
                        <h5 className="text-lg font-semibold text-green-300 mb-4 flex items-center gap-2">
                          <span>🎬</span>
                          <span>Áudio + Vídeo (Arquivo único)</span>
                        </h5>
                        <div className="space-y-3">
                          {videoInfo.formats
                            .filter(f => f.hasAudio && f.hasVideo)
                            .map((format, index) => (
                              <div key={`audio-video-${index}`} className="bg-green-500/10 backdrop-blur border border-green-500/20 rounded-2xl p-6 hover:bg-green-500/20 transition-all duration-300">
                                <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex flex-wrap items-center gap-3 mb-2">
                                      <span className="font-bold text-white text-xl">{format.quality}</span>
                                      <span className="px-3 py-1 bg-green-500/30 rounded-full text-sm text-green-200">{format.container}</span>
                                      {format.fileSize && (
                                        <span className="px-3 py-1 bg-blue-500/30 rounded-lg text-sm text-blue-200">{format.fileSize}</span>
                                      )}
                                    </div>
                                    <span className="px-3 py-1 bg-green-500/30 rounded-lg text-green-200 text-sm">
                                      ✅ Arquivo completo com áudio e vídeo
                                    </span>
                                  </div>

                                  <button
                                    onClick={() => handleDownload(format)}
                                    disabled={downloadingFormats.has(`${format.quality}-${format.container}`)}
                                    className={`font-bold py-3 px-6 rounded-xl transition-all duration-300 transform shadow-lg flex items-center justify-center gap-2 min-w-[120px] ${downloadingFormats.has(`${format.quality}-${format.container}`)
                                      ? 'bg-gradient-to-r from-gray-500 to-gray-600 cursor-not-allowed'
                                      : 'bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 hover:scale-105'
                                      } text-white`}
                                  >
                                    {downloadingFormats.has(`${format.quality}-${format.container}`) ? (
                                      <>
                                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                                        <span className="hidden sm:inline">Baixando...</span>
                                      </>
                                    ) : (
                                      <>
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                        </svg>
                                        <span>Baixar</span>
                                      </>
                                    )}
                                  </button>
                                </div>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}

                    {/* Formatos apenas de Vídeo */}
                    {videoInfo.formats.filter(f => f.hasVideo && !f.hasAudio).length > 0 && (
                      <div>
                        <h5 className="text-lg font-semibold text-purple-300 mb-4 flex items-center gap-2">
                          <span>🎥</span>
                          <span>Apenas Vídeo (sem áudio)</span>
                        </h5>
                        <div className="space-y-3">
                          {videoInfo.formats
                            .filter(f => f.hasVideo && !f.hasAudio)
                            .map((format, index) => (
                              <div key={`video-only-${index}`} className="bg-purple-500/10 backdrop-blur border border-purple-500/20 rounded-2xl p-6 hover:bg-purple-500/20 transition-all duration-300">
                                <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex flex-wrap items-center gap-3 mb-2">
                                      <span className="font-bold text-white text-xl">{format.quality}</span>
                                      <span className="px-3 py-1 bg-purple-500/30 rounded-full text-sm text-purple-200">{format.container}</span>
                                      {format.fileSize && (
                                        <span className="px-3 py-1 bg-blue-500/30 rounded-lg text-sm text-blue-200">{format.fileSize}</span>
                                      )}
                                    </div>
                                    <span className="px-3 py-1 bg-orange-500/30 rounded-lg text-orange-200 text-sm">
                                      ⚠️ Apenas vídeo - sem áudio
                                    </span>
                                  </div>

                                  <div className="flex flex-col sm:flex-row gap-3">
                                    <button
                                      onClick={() => handleDownload(format)}
                                      disabled={downloadingFormats.has(`${format.quality}-${format.container}`)}
                                      className={`font-bold py-3 px-6 rounded-xl transition-all duration-300 transform shadow-lg flex items-center justify-center gap-2 min-w-[120px] ${downloadingFormats.has(`${format.quality}-${format.container}`)
                                        ? 'bg-gradient-to-r from-gray-500 to-gray-600 cursor-not-allowed'
                                        : 'bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 hover:scale-105'
                                        } text-white`}
                                    >
                                      {downloadingFormats.has(`${format.quality}-${format.container}`) ? (
                                        <>
                                          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                                          <span className="hidden sm:inline">Baixando...</span>
                                        </>
                                      ) : (
                                        <>
                                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                          </svg>
                                          <span>Só Vídeo</span>
                                        </>
                                      )}
                                    </button>

                                    <button
                                      onClick={() => handleDownloadVideoAndAudio(format)}
                                      className="bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-bold py-3 px-6 rounded-xl transition-all duration-300 transform hover:scale-105 shadow-lg flex items-center justify-center gap-2 min-w-[160px]"
                                    >
                                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4" />
                                      </svg>
                                      <span className="hidden sm:inline">Vídeo + Áudio</span>
                                      <span className="sm:hidden">V+A</span>
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}

                    {/* Formatos apenas de Áudio */}
                    {videoInfo.formats.filter(f => f.hasAudio && !f.hasVideo).length > 0 && (
                      <div>
                        <h5 className="text-lg font-semibold text-blue-300 mb-4 flex items-center gap-2">
                          <span>🎵</span>
                          <span>Apenas Áudio</span>
                        </h5>
                        <div className="space-y-3">
                          {videoInfo.formats
                            .filter(f => f.hasAudio && !f.hasVideo)
                            .map((format, index) => (
                              <div key={`audio-only-${index}`} className="bg-blue-500/10 backdrop-blur border border-blue-500/20 rounded-2xl p-6 hover:bg-blue-500/20 transition-all duration-300">
                                <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex flex-wrap items-center gap-3 mb-2">
                                      <span className="font-bold text-white text-xl">{format.quality}</span>
                                      <span className="px-3 py-1 bg-blue-500/30 rounded-full text-sm text-blue-200">{format.container}</span>
                                      {format.fileSize && (
                                        <span className="px-3 py-1 bg-blue-500/30 rounded-lg text-sm text-blue-200">{format.fileSize}</span>
                                      )}
                                    </div>
                                    <span className="px-3 py-1 bg-blue-500/30 rounded-lg text-blue-200 text-sm">
                                      🎵 Arquivo de áudio apenas
                                    </span>
                                  </div>

                                  <button
                                    onClick={() => handleDownload(format)}
                                    disabled={downloadingFormats.has(`${format.quality}-${format.container}`)}
                                    className={`font-bold py-3 px-6 rounded-xl transition-all duration-300 transform shadow-lg flex items-center justify-center gap-2 min-w-[120px] ${downloadingFormats.has(`${format.quality}-${format.container}`)
                                      ? 'bg-gradient-to-r from-gray-500 to-gray-600 cursor-not-allowed'
                                      : 'bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 hover:scale-105'
                                      } text-white`}
                                  >
                                    {downloadingFormats.has(`${format.quality}-${format.container}`) ? (
                                      <>
                                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                                        <span className="hidden sm:inline">Baixando...</span>
                                      </>
                                    ) : (
                                      <>
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                                        </svg>
                                        <span>Baixar Áudio</span>
                                      </>
                                    )}
                                  </button>
                                </div>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}          {/* Footer */}
          <div className="text-center mt-12">
            <div className="inline-flex items-center justify-center space-x-6 text-gray-400">
              <div className="flex items-center space-x-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <span className="text-sm">Processamento 100% local</span>
              </div>
              <div className="flex items-center space-x-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <span className="text-sm">Rápido e eficiente</span>
              </div>
              <div className="flex items-center space-x-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                <span className="text-sm">Sem coleta de dados</span>
              </div>
            </div>
            <p className="text-gray-500 text-sm mt-4">
              ⚠️ Respeite os direitos autorais e termos de uso do YouTube
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
