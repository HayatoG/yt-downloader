import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const targetUrl = searchParams.get('url');

        console.log('Proxy request recebido para URL:', targetUrl ? 'URL presente' : 'URL ausente');

        if (!targetUrl) {
            return NextResponse.json({ error: 'URL é obrigatória' }, { status: 400 });
        }

        // Decodificar a URL
        const decodedUrl = decodeURIComponent(targetUrl);
        console.log('Fazendo requisição para YouTube...');

        // Headers mais completos para melhor compatibilidade
        const headers: Record<string, string> = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': '*/*',
            'Accept-Language': 'en-US,en;q=0.9,pt;q=0.8',
            'Accept-Encoding': 'identity', // Evitar compressão para downloads
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            'Range': 'bytes=0-', // Para suporte a downloads parciais
            'Referer': 'https://www.youtube.com/',
            'Origin': 'https://www.youtube.com'
        };

        // Fazer a requisição para o URL do YouTube
        const response = await fetch(decodedUrl, {
            headers,
            method: 'GET'
        });

        console.log('Resposta do YouTube:', response.status, response.statusText);
        console.log('Content-Type:', response.headers.get('Content-Type'));
        console.log('Content-Length:', response.headers.get('Content-Length'));

        if (!response.ok) {
            console.error('Erro na resposta do YouTube:', response.status, response.statusText);

            // Tentar diferentes estratégias baseadas no erro
            if (response.status === 403) {
                throw new Error('Acesso negado - URL pode ter expirado');
            } else if (response.status === 404) {
                throw new Error('Arquivo não encontrado');
            } else {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
        }

        // Obter o conteúdo como ArrayBuffer
        const arrayBuffer = await response.arrayBuffer();
        console.log('Download concluído:', arrayBuffer.byteLength, 'bytes');

        // Determinar Content-Type baseado na URL ou response
        let contentType = response.headers.get('Content-Type') || 'application/octet-stream';

        // Fallback baseado na extensão da URL
        if (contentType === 'application/octet-stream') {
            if (decodedUrl.includes('mime=video')) {
                contentType = 'video/mp4';
            } else if (decodedUrl.includes('mime=audio')) {
                contentType = 'audio/mp4';
            }
        }

        // Criar resposta com headers apropriados para download
        return new NextResponse(arrayBuffer, {
            status: 200,
            headers: {
                'Content-Type': contentType,
                'Content-Length': arrayBuffer.byteLength.toString(),
                'Content-Disposition': 'attachment',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                'Cache-Control': 'no-cache',
                'Accept-Ranges': 'bytes'
            }
        });

    } catch (error) {
        console.error('Erro no proxy:', error);
        return NextResponse.json(
            { error: `Erro ao fazer proxy: ${error instanceof Error ? error.message : 'Erro desconhecido'}` },
            { status: 500 }
        );
    }
}

export async function OPTIONS(request: NextRequest) {
    return new NextResponse(null, {
        status: 200,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
    });
}
