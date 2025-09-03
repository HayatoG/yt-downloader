import { NextRequest, NextResponse } from 'next/server';
import ytdl from '@distube/ytdl-core';

const YTDL_OPTIONS = {
    requestOptions: {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'DNT': '1',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'sec-ch-ua': '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"'
        },
        timeout: 30000
    }
};

export async function POST(request: NextRequest) {
    console.log('🚀 === INÍCIO DA REQUISIÇÃO ===');

    try {
        console.log('📝 Fazendo parse do JSON...');
        const { url } = await request.json();
        console.log('✅ JSON parseado com sucesso');

        if (!url) {
            console.log('❌ URL não fornecida');
            return NextResponse.json({ error: 'URL é obrigatória' }, { status: 400 });
        }

        console.log('🔍 Processando URL:', url);

        // Estratégia múltipla para obter informações e formatos
        let info;
        let allFormatsData: any[] = [];

        // Opções mais agressivas para contornar restrições
        const enhancedOptions = {
            requestOptions: {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9,pt-BR;q=0.8,pt;q=0.7',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache',
                    'DNT': '1',
                    'Connection': 'keep-alive',
                    'Upgrade-Insecure-Requests': '1',
                    'Sec-Fetch-Dest': 'document',
                    'Sec-Fetch-Mode': 'navigate',
                    'Sec-Fetch-Site': 'none',
                    'Sec-Fetch-User': '?1',
                    'sec-ch-ua': '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
                    'sec-ch-ua-mobile': '?0',
                    'sec-ch-ua-platform': '"Windows"',
                    'X-YouTube-Client-Name': '1',
                    'X-YouTube-Client-Version': '2.20240101.01.00'
                },
                timeout: 45000,
                maxRedirects: 10
            },
            // Desabilitar criação de arquivos de debug
            debug: false,
            dumpJson: false
        };

        // Estratégia 1: getInfo completo com configurações aprimoradas e decifração forçada
        try {
            console.log('📡 Tentativa 1: ytdl.getInfo com decifração completa...');

            // Usar opções que forçam a obtenção de URLs válidas
            const fullOptions = {
                ...enhancedOptions,
                format: 'any', // Aceitar qualquer formato
                quality: 'highest', // Priorizar qualidade alta
            };

            info = await ytdl.getInfo(url, fullOptions);
            console.log('✅ ytdl.getInfo com decifração bem-sucedido');

            if (info.formats) {
                console.log(`📹 Encontrados ${info.formats.length} formatos em info.formats`);

                // Filtrar apenas formatos com URL válida
                const validFormats = info.formats.filter((format: any) => format.url);
                console.log(`✅ Formatos com URL válida: ${validFormats.length}`);

                allFormatsData = [...info.formats]; // Manter todos para análise, filtraremos depois

                // Log detalhado dos primeiros formatos
                info.formats.slice(0, 10).forEach((format: any, i: number) => {
                    console.log(`  Formato ${i}: itag=${format.itag}, quality=${format.qualityLabel || format.quality}, mimeType=${format.mimeType}, hasUrl=${!!format.url}`);
                });
            }
        } catch (err) {
            console.log('⚠️ ytdl.getInfo com decifração falhou:', err);

            // Tentativa 1.1: getInfo sem opções específicas mas com qualidade forçada
            try {
                console.log('📡 Tentativa 1.1: ytdl.getInfo com configurações básicas...');
                const basicOptions = {
                    ...YTDL_OPTIONS,
                    quality: 'highest'
                };

                info = await ytdl.getInfo(url, basicOptions);
                console.log('✅ ytdl.getInfo básico bem-sucedido');

                if (info.formats) {
                    console.log(`📹 Encontrados ${info.formats.length} formatos em info.formats`);
                    const validFormats = info.formats.filter((format: any) => format.url);
                    console.log(`✅ Formatos com URL válida: ${validFormats.length}`);
                    allFormatsData = [...info.formats];
                }
            } catch (err1_1) {
                console.log('⚠️ ytdl.getInfo básico também falhou:', err1_1);
            }
        }

        // Estratégia 2: getBasicInfo se getInfo falhou
        if (!info) {
            try {
                console.log('📡 Tentativa 2: ytdl.getBasicInfo...');
                info = await ytdl.getBasicInfo(url);
                console.log('✅ ytdl.getBasicInfo bem-sucedido');
            } catch (err2) {
                console.error('❌ ytdl.getBasicInfo também falhou:', err2);
                return NextResponse.json({ error: 'Não foi possível obter informações do vídeo' }, { status: 500 });
            }
        }

        // Estratégia 2.5: Tentar getInfo uma última vez com configurações mínimas se ainda não temos formatos válidos
        if (allFormatsData.length === 0 || allFormatsData.filter((f: any) => f.url).length === 0) {
            try {
                console.log('📡 Tentativa 2.5: ytdl.getInfo com configurações mínimas para formatos...');
                const minimalOptions = {
                    requestOptions: {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
                        }
                    }
                };

                const fallbackInfo = await ytdl.getInfo(url, minimalOptions);
                if (fallbackInfo.formats && fallbackInfo.formats.some((f: any) => f.url)) {
                    console.log(`🔄 Fallback: Encontrados ${fallbackInfo.formats.length} formatos`);
                    const validFallbackFormats = fallbackInfo.formats.filter((f: any) => f.url);
                    console.log(`✅ Formatos válidos no fallback: ${validFallbackFormats.length}`);

                    // Substituir ou adicionar apenas se conseguiu formatos melhores
                    if (validFallbackFormats.length > allFormatsData.filter((f: any) => f.url).length) {
                        allFormatsData = [...fallbackInfo.formats];
                        console.log('🔄 Usando formatos do fallback');
                    }
                }
            } catch (fallbackErr) {
                console.log('⚠️ Fallback também falhou:', fallbackErr);
            }
        }

        // Estratégia 3: Extrair formatos do streamingData (mais confiável para alta qualidade)
        if (info.player_response?.streamingData) {
            const streamingData = info.player_response.streamingData;

            // Formatos combinados (áudio + vídeo) - geralmente baixa qualidade
            const combinedFormats = streamingData.formats || [];
            console.log(`� Formatos combinados: ${combinedFormats.length}`);

            // Formatos adaptivos (separados) - geralmente alta qualidade
            const adaptiveFormats = streamingData.adaptiveFormats || [];
            console.log(`� Formatos adaptivos: ${adaptiveFormats.length}`);

            // Log detalhado dos formatos adaptivos (onde estão as altas qualidades)
            adaptiveFormats.slice(0, 10).forEach((format: any, i: number) => {
                console.log(`  Adaptivo ${i}: itag=${format.itag}, quality=${format.qualityLabel || format.quality || 'N/A'}, type=${format.mimeType}, width=${format.width}, height=${format.height}`);
            });

            const streamFormats = [...combinedFormats, ...adaptiveFormats];

            // Combinar com formatos já existentes, evitando duplicatas
            if (allFormatsData.length > 0) {
                const existingItags = new Set(allFormatsData.map(f => f.itag));
                const newFormats = streamFormats.filter((f: any) => !existingItags.has(f.itag));
                allFormatsData = [...allFormatsData, ...newFormats];
                console.log(`🔗 Adicionados ${newFormats.length} novos formatos do streamingData`);
            } else {
                allFormatsData = streamFormats;
                console.log(`📋 Usando ${streamFormats.length} formatos do streamingData`);
            }
        }

        console.log(`🎯 Total de formatos únicos: ${allFormatsData.length}`);

        // Estratégia adicional: Tentar obter formatos específicos usando chooseFormat
        if (info && allFormatsData.length > 0) {
            try {
                console.log('🎯 Tentando ytdl.chooseFormat para validar URLs...');

                // Tentar diferentes qualidades conhecidas
                const qualitiesAttempt = ['highest', 'lowest', 'highestvideo', 'lowestvideo', 'highestaudio', 'lowestaudio'];
                let chosenFormats: any[] = [];

                for (const quality of qualitiesAttempt) {
                    try {
                        const chosen = ytdl.chooseFormat(allFormatsData, { quality });
                        if (chosen && chosen.url && !chosenFormats.some(f => f.itag === chosen.itag)) {
                            chosenFormats.push(chosen);
                            console.log(`✅ Formato escolhido para ${quality}: itag=${chosen.itag}, quality=${chosen.qualityLabel || chosen.quality}`);
                        }
                    } catch (chooseErr) {
                        // Não logar erro, é normal algumas qualidades não estarem disponíveis
                    }
                }

                if (chosenFormats.length > 0) {
                    console.log(`🎯 chooseFormat retornou ${chosenFormats.length} formatos válidos`);

                    // Adicionar formatos escolhidos que não estão na lista
                    chosenFormats.forEach(chosen => {
                        const existingIndex = allFormatsData.findIndex(f => f.itag === chosen.itag);
                        if (existingIndex >= 0) {
                            // Atualizar formato existente com URL válida se necessário
                            if (!allFormatsData[existingIndex].url && chosen.url) {
                                allFormatsData[existingIndex] = { ...allFormatsData[existingIndex], ...chosen };
                                console.log(`🔄 Atualizado formato itag=${chosen.itag} com URL válida`);
                            }
                        } else {
                            // Adicionar novo formato
                            allFormatsData.push(chosen);
                            console.log(`➕ Adicionado novo formato itag=${chosen.itag}`);
                        }
                    });
                }
            } catch (chooseErr) {
                console.log('⚠️ ytdl.chooseFormat falhou:', chooseErr);
            }
        }

        const videoDetails = info.videoDetails || info.player_response?.videoDetails || { title: 'Unknown', lengthSeconds: '0', thumbnails: [] };

        // Processar e categorizar formatos
        const processedFormats: any[] = [];

        allFormatsData.forEach((format: any, index: number) => {
            try {
                // Debug detalhado do formato
                console.log(`🔍 Analisando formato ${index}:`, {
                    itag: format.itag,
                    mimeType: format.mimeType,
                    qualityLabel: format.qualityLabel,
                    quality: format.quality,
                    width: format.width,
                    height: format.height,
                    fps: format.fps,
                    hasUrl: !!format.url
                });

                // Verificar se o formato tem URL válida ou pode ser obtida
                let finalUrl = format.url;

                // Se não tem URL direta, tentar outras formas
                if (!finalUrl) {
                    // Verificar se há cipher ou signatureCipher que precisa ser decodificado
                    if (format.cipher || format.signatureCipher) {
                        console.log(`🔐 Formato ${index} (itag: ${format.itag}) tem cipher, tentando decodificar...`);
                        // A biblioteca ytdl-core deve ter decodificado automaticamente, mas vamos verificar
                        try {
                            // Se chegou até aqui mas ainda não tem URL, a decodificação falhou
                            console.log(`❌ Decodificação de cipher falhou para formato ${index}`);
                        } catch (cipherErr) {
                            console.log(`❌ Erro ao processar cipher do formato ${index}:`, cipherErr);
                        }
                    }

                    // Se ainda não tem URL, pular este formato
                    if (!finalUrl) {
                        console.log(`⚠️ Formato ${index} (itag: ${format.itag}) sem URL válida - PULANDO`);
                        return;
                    }
                } else {
                    console.log(`✅ Formato ${index} (itag: ${format.itag}) tem URL válida`);
                }

                // Determinar tipo de mídia com mais precisão
                const mimeType = format.mimeType || '';
                const hasVideo = mimeType.includes('video') || format.width || format.height || format.qualityLabel;
                const hasAudio = mimeType.includes('audio') || format.audioQuality || format.audioBitrate || format.audioChannels || (!hasVideo && !mimeType.includes('video'));

                // Extrair qualidade com mais precisão
                let quality = 'Unknown';
                if (format.qualityLabel) {
                    quality = format.qualityLabel;
                } else if (format.height) {
                    quality = `${format.height}p`;
                } else if (format.width && format.height) {
                    // Calcular qualidade baseada na altura
                    if (format.height >= 2160) quality = '2160p';
                    else if (format.height >= 1440) quality = '1440p';
                    else if (format.height >= 1080) quality = '1080p';
                    else if (format.height >= 720) quality = '720p';
                    else if (format.height >= 480) quality = '480p';
                    else if (format.height >= 360) quality = '360p';
                    else if (format.height >= 240) quality = '240p';
                    else quality = '144p';
                } else if (format.quality) {
                    quality = format.quality;
                } else if (hasAudio && !hasVideo) {
                    quality = format.audioBitrate ? `${format.audioBitrate}kbps` : 'Audio';
                }

                const container = mimeType.split('/')[1]?.split(';')[0] || 'mp4';
                const fileSize = format.contentLength ? `${Math.round(parseInt(format.contentLength) / (1024 * 1024))} MB` : undefined;

                const processedFormat = {
                    quality,
                    container,
                    downloadUrl: finalUrl,
                    fileSize,
                    hasAudio,
                    hasVideo,
                    itag: format.itag || 0,
                    bitrate: format.bitrate || format.audioBitrate || 0,
                    fps: format.fps || null,
                    width: format.width || null,
                    height: format.height || null
                };

                processedFormats.push(processedFormat);

                console.log(`✅ Formato processado: ${quality} (${container}) - Audio: ${hasAudio}, Video: ${hasVideo}, itag: ${format.itag}`);
            } catch (err) {
                console.error(`❌ Erro ao processar formato ${index}:`, err);
            }
        });

        // Filtrar duplicatas de forma mais inteligente, mas preservar variações
        const uniqueFormats = processedFormats.filter((format, index, self) => {
            // Para formatos de vídeo, manter diferentes contêineres e qualidades
            if (format.hasVideo) {
                return index === self.findIndex(f =>
                    f.itag === format.itag // Usar itag como identificador único
                );
            }

            // Para formatos de áudio, manter diferentes bitrates
            if (format.hasAudio && !format.hasVideo) {
                return index === self.findIndex(f =>
                    f.itag === format.itag
                );
            }

            return true;
        });

        console.log(`🎯 Formatos únicos após filtragem por itag: ${uniqueFormats.length}`);

        // Debug: listar todos os formatos únicos encontrados
        uniqueFormats.forEach(format => {
            console.log(`📋 Formato único: ${format.quality} (${format.container}) - itag: ${format.itag} - Audio: ${format.hasAudio}, Video: ${format.hasVideo}`);
        });

        // Ordenar formatos de forma mais inteligente
        uniqueFormats.sort((a, b) => {
            // Primeiro: formatos com áudio e vídeo
            if (a.hasAudio && a.hasVideo && !(b.hasAudio && b.hasVideo)) return -1;
            if (b.hasAudio && b.hasVideo && !(a.hasAudio && a.hasVideo)) return 1;

            // Segundo: apenas vídeo
            if (a.hasVideo && !a.hasAudio && !(b.hasVideo && !b.hasAudio)) return -1;
            if (b.hasVideo && !b.hasAudio && !(a.hasVideo && !a.hasAudio)) return 1;

            // Dentro da mesma categoria, ordenar por qualidade
            const qualityOrder: { [key: string]: number } = {
                '2160p': 100, '1440p': 90, '1080p': 80, '720p': 70,
                '480p': 60, '360p': 50, '240p': 40, '144p': 30
            };

            // Usar altura como fallback se qualidade não estiver na lista
            let aOrder = qualityOrder[a.quality] || 0;
            let bOrder = qualityOrder[b.quality] || 0;

            // Se não encontrou na lista de qualidades, usar altura diretamente
            if (aOrder === 0 && a.height) {
                aOrder = a.height / 10; // Normalizar altura
            }
            if (bOrder === 0 && b.height) {
                bOrder = b.height / 10; // Normalizar altura
            }

            // Se ainda empate, usar bitrate
            if (aOrder === bOrder) {
                const aBitrate = a.bitrate || 0;
                const bBitrate = b.bitrate || 0;
                return bBitrate - aBitrate;
            }

            return bOrder - aOrder;
        });

        const result = {
            title: videoDetails.title,
            duration: videoDetails.lengthSeconds,
            thumbnail: videoDetails.thumbnails?.[0]?.url || videoDetails.thumbnails?.[videoDetails.thumbnails.length - 1]?.url,
            formats: uniqueFormats
        };

        console.log(`🎉 Retornando ${uniqueFormats.length} formatos processados`);
        return NextResponse.json(result);

    } catch (error) {
        console.error('💥 Erro ao processar vídeo:', error);
        return NextResponse.json({ error: 'Erro ao processar o vídeo do YouTube' }, { status: 500 });
    }
}

export async function GET() {
    return NextResponse.json({ message: 'Use POST para enviar uma URL do YouTube com headers do cliente' });
}
