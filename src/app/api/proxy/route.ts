import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const targetUrl = searchParams.get('url');
        const requestFilename = searchParams.get('filename');

        console.log('🔄 Proxy request recebido para URL:', targetUrl ? 'URL presente' : 'URL ausente');

        if (!targetUrl) {
            return NextResponse.json({ error: 'URL é obrigatória' }, { status: 400 });
        }

        // Decodificar a URL
        const decodedUrl = decodeURIComponent(targetUrl);
        console.log('📡 Fazendo requisição para YouTube...');

        // Headers mais robustos para melhor compatibilidade
        const headers: Record<string, string> = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': '*/*',
            'Accept-Language': 'en-US,en;q=0.9,pt;q=0.8',
            'Accept-Encoding': 'identity', // Evitar compressão
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            'Sec-Fetch-Dest': 'video',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'cross-site',
            'Referer': 'https://www.youtube.com/',
            'Origin': 'https://www.youtube.com'
        };

        // Fazer a requisição para o URL do YouTube
        const response = await fetch(decodedUrl, {
            headers,
            method: 'GET'
        });

        console.log('📊 Resposta do YouTube:', response.status, response.statusText);
        console.log('📋 Content-Type:', response.headers.get('Content-Type'));
        console.log('📏 Content-Length:', response.headers.get('Content-Length'));

        if (!response.ok) {
            console.error('❌ Erro na resposta do YouTube:', response.status, response.statusText);

            // Tratamento específico de erros
            if (response.status === 403) {
                throw new Error('Acesso negado - URL pode ter expirado ou ser restrita');
            } else if (response.status === 404) {
                throw new Error('Arquivo não encontrado');
            } else if (response.status === 429) {
                throw new Error('Muitas requisições - tente novamente em alguns minutos');
            } else {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
        }

        // Verificar Content-Type para garantir que é mídia válida
        const upstreamContentType = response.headers.get('Content-Type') || '';
        console.log('🔍 Verificando tipo de conteúdo:', upstreamContentType);

        if (upstreamContentType.includes('text/html')) {
            console.error('❌ Upstream retornou HTML em vez de mídia');
            return NextResponse.json({
                error: 'URL retornou página HTML em vez de arquivo de mídia. O link pode ter expirado.'
            }, { status: 502 });
        }

        // Obter o conteúdo como stream
        if (!response.body) {
            throw new Error('Resposta sem corpo');
        }

        // Determinar Content-Type correto
        let contentType = upstreamContentType;

        // Fallback para determinar tipo baseado na URL ou extensão
        if (contentType === 'application/octet-stream' || !contentType) {
            if (decodedUrl.includes('mime=video%2Fmp4') || decodedUrl.includes('mime=video/mp4')) {
                contentType = 'video/mp4';
            } else if (decodedUrl.includes('mime=video%2Fwebm') || decodedUrl.includes('mime=video/webm')) {
                contentType = 'video/webm';
            } else if (decodedUrl.includes('mime=audio%2Fmp4') || decodedUrl.includes('mime=audio/mp4')) {
                contentType = 'audio/mp4';
            } else if (decodedUrl.includes('mime=audio%2Fwebm') || decodedUrl.includes('mime=audio/webm')) {
                contentType = 'audio/webm';
            } else {
                // Tentar deduzir pela estrutura da URL
                const urlObj = new URL(decodedUrl);
                const mimeParam = urlObj.searchParams.get('mime');
                if (mimeParam) {
                    contentType = decodeURIComponent(mimeParam);
                } else {
                    contentType = 'video/mp4'; // fallback seguro
                }
            }
        }

        console.log('🎯 Content-Type final:', contentType);

        // Determinar nome do arquivo
        let filename = 'download';
        if (requestFilename) {
            filename = decodeURIComponent(requestFilename);
        } else {
            // Tentar extrair da URL
            try {
                const urlObj = new URL(decodedUrl);
                const nameFromQs = urlObj.searchParams.get('filename') || urlObj.searchParams.get('name');
                if (nameFromQs) {
                    filename = decodeURIComponent(nameFromQs);
                }
            } catch (e) {
                // ignore
            }
        }

        console.log('📁 Nome do arquivo:', filename);

        // Criar resposta com headers apropriados para download
        const responseHeaders: Record<string, string> = {
            'Content-Type': contentType,
            'Content-Disposition': `attachment; filename="${filename}"`,
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
            'Accept-Ranges': 'bytes'
        };

        // Copiar content-length se disponível
        const contentLength = response.headers.get('Content-Length');
        if (contentLength) {
            responseHeaders['Content-Length'] = contentLength;
        }

        console.log('✅ Iniciando stream do arquivo...');

        // Retornar o stream diretamente
        return new NextResponse(response.body, {
            status: 200,
            headers: responseHeaders
        });

    } catch (error) {
        console.error('💥 Erro no proxy:', error);
        return NextResponse.json(
            { error: `Erro ao fazer proxy: ${error instanceof Error ? error.message : 'Erro desconhecido'}` },
            { status: 500 }
        );
    }
}

export async function OPTIONS() {
    return new NextResponse(null, {
        status: 200,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
    });
}
