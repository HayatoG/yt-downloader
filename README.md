# YouTube Downloader

Uma aplicação Next.js para download de vídeos do YouTube de forma simples e direta.

## Funcionalidades

- ✅ Interface limpa e intuitiva
- ✅ Download direto para o computador do usuário
- ✅ Visualização de informações do vídeo (título, duração, thumbnail)
- ✅ Suporte a diferentes qualidades de vídeo
- ✅ Design responsivo com modo escuro
- ✅ Validação de URLs do YouTube

## Tecnologias Utilizadas

- **Next.js 15** - Framework React para aplicações web
- **TypeScript** - Tipagem estática para JavaScript
- **Tailwind CSS** - Framework de CSS utilitário
- **@distube/ytdl-core** - Biblioteca para download de vídeos do YouTube
- **React Hooks** - Para gerenciamento de estado

## Como Usar

1. **Instalação das dependências:**
   ```bash
   npm install
   ```

2. **Executar em modo desenvolvimento:**
   ```bash
   npm run dev
   ```

3. **Acessar a aplicação:**
   - Abra [http://localhost:3000](http://localhost:3000) no seu navegador

4. **Usar a aplicação:**
   - Cole a URL do vídeo do YouTube no campo de entrada
   - Clique em "Obter Informações do Vídeo"
   - Visualize as informações do vídeo
   - Clique em "Baixar Vídeo" para fazer o download

## Estrutura do Projeto

```
src/
├── app/
│   ├── api/
│   │   └── download/
│   │       └── route.ts          # API para processar downloads
│   ├── globals.css               # Estilos globais
│   ├── layout.tsx                # Layout da aplicação
│   └── page.tsx                  # Página principal
└── ...
```

## Scripts Disponíveis

- `npm run dev` - Inicia o servidor de desenvolvimento
- `npm run build` - Gera build de produção
- `npm start` - Inicia servidor de produção
- `npm run lint` - Executa o linter

## Importante

⚠️ **Aviso Legal**: Este projeto é apenas para fins educacionais. Respeite os direitos autorais e os termos de uso do YouTube. O usuário é responsável pelo uso apropriado desta ferramenta.

## Contribuição

1. Fork o projeto
2. Crie uma branch para sua feature (`git checkout -b feature/AmazingFeature`)
3. Commit suas mudanças (`git commit -m 'Add some AmazingFeature'`)
4. Push para a branch (`git push origin feature/AmazingFeature`)
5. Abra um Pull Request

## Licença

Este projeto está sob a licença MIT. Veja o arquivo `LICENSE` para mais detalhes.
