import { NextRequest, NextResponse } from 'next/server';
import ytdl from '@distube/ytdl-core';

// Configurações para evitar detecção de bot
const YTDL_OPTIONS = {
    requestOptions: {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1'
        }
    }
};

// Cache simples para evitar requests repetidos
const cache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutos

// Rate limiting simples
let lastRequest = 0;
const MIN_DELAY = 1000; // 1 segundo entre requests

export async function POST(request: NextRequest) {
    try {
        const { url } = await request.json();

        if (!url) {
            return NextResponse.json({ error: 'URL é obrigatória' }, { status: 400 });
        }

        // Validar se é uma URL válida do YouTube
        if (!ytdl.validateURL(url)) {
            return NextResponse.json({ error: 'URL do YouTube inválida' }, { status: 400 });
        }

        // Rate limiting - aguardar entre requests
        const now = Date.now();
        if (now - lastRequest < MIN_DELAY) {
            await new Promise(resolve => setTimeout(resolve, MIN_DELAY - (now - lastRequest)));
        }
        lastRequest = Date.now();

        // Verificar cache
        const cacheKey = url;
        const cached = cache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
            console.log('Retornando dados do cache para:', url);
            return NextResponse.json(cached.data);
        }

        // Obter informações do vídeo com configurações anti-bot
        let info;
        try {
            info = await ytdl.getInfo(url, YTDL_OPTIONS);
        } catch (error) {
            // Fallback: tentar sem opções customizadas
            console.log('Primeira tentativa falhou, tentando fallback...');
            try {
                info = await ytdl.getBasicInfo(url);
            } catch (fallbackError) {
                console.error('Ambas as tentativas falharam:', error, fallbackError);
                return NextResponse.json({
                    error: 'YouTube bloqueou o acesso. Tente novamente em alguns minutos ou use uma VPN.'
                }, { status: 429 });
            }
        }
        // videoDetails pode vir em lugares diferentes dependendo da versão/fallback
        const videoDetails = info.videoDetails || info.player_response?.videoDetails || { title: 'Unknown', lengthSeconds: '0', thumbnails: [] };

        // Se info.formats estiver presente, usar normalmente
        let rawFormats: any[] = info.formats || [];

        // Se não houver formatos, tentar extrair do streamingData
        if (!rawFormats.length && info.player_response?.streamingData) {
            const streamingData = info.player_response.streamingData;
            rawFormats = [
                ...(streamingData.formats || []),
                ...(streamingData.adaptiveFormats || [])
            ].map((format: any) => ({
                ...format,
                // Mapear propriedades para compatibilidade com ytdl.filterFormats
                hasAudio: format.mimeType?.includes('audio') || (!format.mimeType?.includes('video') && format.audioQuality) || false,
                hasVideo: format.mimeType?.includes('video') || format.width || false,
                qualityLabel: format.qualityLabel || format.quality || 'Unknown',
                container: format.mimeType?.split('/')[1]?.split(';')[0] || 'mp4',
                url: format.url,
                contentLength: format.contentLength,
                itag: format.itag || 0,
                quality: format.quality || 'Unknown',
                codecs: format.codecs || '',
                bitrate: format.bitrate || 0,
                audioBitrate: format.audioBitrate || 0
            }));
        }

        console.log('Debug info.formats:', info.formats ? 'present' : 'undefined');
        console.log('Debug player_response:', info.player_response ? 'present' : 'undefined');
        console.log('Debug streamingData:', info.player_response?.streamingData ? 'present' : 'undefined');
        console.log('Debug rawFormats length:', rawFormats.length);

        // Usar filterFormats se rawFormats veio de info.formats, senão filtrar manualmente
        let videoAndAudioFormats, videoOnlyFormats, audioOnlyFormats;

        if (info.formats) {
            videoAndAudioFormats = ytdl.filterFormats(rawFormats, 'videoandaudio');
            videoOnlyFormats = ytdl.filterFormats(rawFormats, 'videoonly');
            audioOnlyFormats = ytdl.filterFormats(rawFormats, 'audioonly');
        } else {
            // Filtragem manual para formatos do streamingData
            videoAndAudioFormats = rawFormats.filter(f => f.hasVideo && f.hasAudio);
            videoOnlyFormats = rawFormats.filter(f => f.hasVideo && !f.hasAudio);
            audioOnlyFormats = rawFormats.filter(f => f.hasAudio && !f.hasVideo);
        }

        console.log('Debug filtered formats:', {
            videoAndAudio: videoAndAudioFormats.length,
            videoOnly: videoOnlyFormats.length,
            audioOnly: audioOnlyFormats.length
        });

        if (videoAndAudioFormats.length === 0 && videoOnlyFormats.length === 0 && audioOnlyFormats.length === 0) {
            return NextResponse.json({ error: 'Nenhum formato disponível para download' }, { status: 404 });
        }

        // Processar formatos com áudio e vídeo
        const formatMap = new Map();

        // Adicionar formatos com áudio (prioridade)
        videoAndAudioFormats.forEach(format => {
            const quality = format.qualityLabel || format.quality || 'Unknown';
            const key = `${quality}-${format.container}-audio`;

            if (!formatMap.has(key) && format.url) {
                const fileSize = format.contentLength ?
                    `${Math.round(parseInt(format.contentLength) / (1024 * 1024))} MB` :
                    undefined;

                formatMap.set(key, {
                    quality: quality,
                    container: format.container || 'mp4',
                    downloadUrl: format.url,
                    fileSize: fileSize,
                    hasAudio: true,
                    hasVideo: true
                });
            }
        });

        // Adicionar formatos só de vídeo (sem áudio)
        videoOnlyFormats.forEach(format => {
            const quality = format.qualityLabel || format.quality || 'Unknown';
            const key = `${quality}-${format.container}-noaudio`;

            if (!formatMap.has(key) && format.url) {
                const fileSize = format.contentLength ?
                    `${Math.round(parseInt(format.contentLength) / (1024 * 1024))} MB` :
                    undefined;

                formatMap.set(key, {
                    quality: quality,
                    container: format.container || 'mp4',
                    downloadUrl: format.url,
                    fileSize: fileSize,
                    hasAudio: false,
                    hasVideo: true
                });
            }
        });

        // Adicionar formatos só de áudio
        audioOnlyFormats.forEach(format => {
            const quality = format.audioBitrate ? `${format.audioBitrate}kbps` : 'Audio';
            const key = `audio-${format.container}-${format.audioBitrate}`;

            if (!formatMap.has(key) && format.url) {
                const fileSize = format.contentLength ?
                    `${Math.round(parseInt(format.contentLength) / (1024 * 1024))} MB` :
                    undefined;

                formatMap.set(key, {
                    quality: quality,
                    container: format.container || 'mp3',
                    downloadUrl: format.url,
                    fileSize: fileSize,
                    hasAudio: true,
                    hasVideo: false
                });
            }
        });

        // Converter para array e ordenar
        const availableFormats = Array.from(formatMap.values())
            .sort((a, b) => {
                // Primeiro, priorizar formatos com áudio e vídeo
                if (a.hasAudio && a.hasVideo && !(b.hasAudio && b.hasVideo)) return -1;
                if (b.hasAudio && b.hasVideo && !(a.hasAudio && a.hasVideo)) return 1;

                // Depois, ordenar por qualidade
                const qualityOrder: { [key: string]: number } = {
                    '2160p': 8, '1440p': 7, '1080p': 6, '720p': 5,
                    '480p': 4, '360p': 3, '240p': 2, '144p': 1
                };

                const aOrder = qualityOrder[a.quality] || 0;
                const bOrder = qualityOrder[b.quality] || 0;

                return bOrder - aOrder;
            });

        const result = {
            title: videoDetails.title,
            duration: videoDetails.lengthSeconds,
            thumbnail: videoDetails.thumbnails[0]?.url,
            formats: availableFormats
        };

        // Armazenar no cache
        cache.set(cacheKey, {
            data: result,
            timestamp: Date.now()
        });

        return NextResponse.json(result);

    } catch (error) {
        console.error('Erro ao processar vídeo:', error);

        // Tratamento específico de erros
        if (error instanceof Error) {
            if (error.message.includes('Sign in to confirm') || error.message.includes('bot')) {
                return NextResponse.json(
                    {
                        error: 'YouTube detectou atividade suspeita. Aguarde alguns minutos e tente novamente, ou use uma VPN.'
                    },
                    { status: 429 }
                );
            }

            if (error.message.includes('Video unavailable') || error.message.includes('private')) {
                return NextResponse.json(
                    { error: 'Vídeo indisponível, privado ou foi removido.' },
                    { status: 404 }
                );
            }

            if (error.message.includes('age-restricted')) {
                return NextResponse.json(
                    { error: 'Vídeo com restrição de idade. Não é possível baixar.' },
                    { status: 403 }
                );
            }
        }

        return NextResponse.json(
            { error: 'Erro ao processar o vídeo do YouTube. Tente novamente em alguns minutos.' },
            { status: 500 }
        );
    }
}

export async function GET() {
    return NextResponse.json({ message: 'Use POST para enviar uma URL do YouTube' });
}
