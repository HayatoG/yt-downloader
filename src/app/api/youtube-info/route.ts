import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
    try {
        const { url, userAgent, cookies } = await request.json();

        if (!url) {
            return NextResponse.json({ error: 'URL é obrigatória' }, { status: 400 });
        }

        // Extrair ID do vídeo
        const videoId = extractVideoId(url);
        if (!videoId) {
            return NextResponse.json({ error: 'URL do YouTube inválida' }, { status: 400 });
        }

        // Usar headers do navegador do usuário para fazer a requisição
        const headers: Record<string, string> = {
            'User-Agent': userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Cache-Control': 'max-age=0'
        };

        if (cookies) {
            headers['Cookie'] = cookies;
        }

        // Obter informações básicas do vídeo usando oembed (sempre funciona)
        const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
        const oembedResponse = await fetch(oembedUrl);

        if (!oembedResponse.ok) {
            return NextResponse.json({ error: 'Vídeo não encontrado' }, { status: 404 });
        }

        const oembedData = await oembedResponse.json();

        // Tentar obter mais informações fazendo uma requisição à página do YouTube
        try {
            const pageResponse = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
                headers
            });

            if (pageResponse.ok) {
                const pageHtml = await pageResponse.text();

                // Extrair informações adicionais do HTML (duração, descrição, etc.)
                const durationMatch = pageHtml.match(/"lengthSeconds":"(\d+)"/);
                const duration = durationMatch ? durationMatch[1] : '0';

                // Extrair formatos disponíveis (simplificado)
                const formats = [
                    {
                        quality: '720p',
                        container: 'mp4',
                        downloadUrl: `https://www.youtube.com/watch?v=${videoId}`, // URL original como fallback
                        fileSize: 'Desconhecido',
                        hasAudio: true,
                        hasVideo: true
                    },
                    {
                        quality: '480p',
                        container: 'mp4',
                        downloadUrl: `https://www.youtube.com/watch?v=${videoId}`,
                        fileSize: 'Desconhecido',
                        hasAudio: true,
                        hasVideo: true
                    },
                    {
                        quality: '360p',
                        container: 'mp4',
                        downloadUrl: `https://www.youtube.com/watch?v=${videoId}`,
                        fileSize: 'Desconhecido',
                        hasAudio: true,
                        hasVideo: true
                    },
                    {
                        quality: 'Audio',
                        container: 'mp4',
                        downloadUrl: `https://www.youtube.com/watch?v=${videoId}`,
                        fileSize: 'Desconhecido',
                        hasAudio: true,
                        hasVideo: false
                    }
                ];

                return NextResponse.json({
                    title: oembedData.title,
                    duration: duration,
                    thumbnail: oembedData.thumbnail_url,
                    formats: formats
                });
            }
        } catch (pageError) {
            console.log('Erro ao obter página do YouTube:', pageError);
        }

        // Fallback: retornar apenas informações do oembed
        const basicFormats = [
            {
                quality: 'Padrão',
                container: 'mp4',
                downloadUrl: url,
                fileSize: 'Desconhecido',
                hasAudio: true,
                hasVideo: true
            }
        ];

        return NextResponse.json({
            title: oembedData.title,
            duration: '0',
            thumbnail: oembedData.thumbnail_url,
            formats: basicFormats
        });

    } catch (error) {
        console.error('Erro ao processar vídeo:', error);
        return NextResponse.json(
            { error: 'Erro ao processar o vídeo do YouTube' },
            { status: 500 }
        );
    }
}

function extractVideoId(url: string): string | null {
    const regex = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/;
    const match = url.match(regex);
    return match ? match[1] : null;
}

export async function GET() {
    return NextResponse.json({ message: 'Use POST para enviar uma URL do YouTube com headers do cliente' });
}
