import { NextRequest, NextResponse } from 'next/server';
import ytdl from '@distube/ytdl-core';

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

        // Obter informações do vídeo
        const info = await ytdl.getInfo(url);
        const videoDetails = info.videoDetails;

        // Separar formatos com e sem áudio
        const videoAndAudioFormats = ytdl.filterFormats(info.formats, 'videoandaudio');
        const videoOnlyFormats = ytdl.filterFormats(info.formats, 'videoonly');
        const audioOnlyFormats = ytdl.filterFormats(info.formats, 'audioonly');

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

        return NextResponse.json({
            title: videoDetails.title,
            duration: videoDetails.lengthSeconds,
            thumbnail: videoDetails.thumbnails[0]?.url,
            formats: availableFormats
        });

    } catch (error) {
        console.error('Erro ao processar vídeo:', error);
        return NextResponse.json(
            { error: 'Erro ao processar o vídeo do YouTube' },
            { status: 500 }
        );
    }
}

export async function GET() {
    return NextResponse.json({ message: 'Use POST para enviar uma URL do YouTube' });
}
