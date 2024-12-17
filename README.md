# FILL - League of Legends Flex Queue Hub

FILL é uma aplicação desktop construída com Electron que ajuda jogadores de League of Legends a encontrar times para jogar flex queue.

## 🚀 Como Executar

1. Certifique-se de ter o [Node.js](https://nodejs.org/) instalado (versão 14 ou superior)
2. Clone o repositório
3. Instale as dependências:
```bash
npm install
```
4. Execute a aplicação:
```bash
npm start
```

## 📁 Estrutura do Projeto

- `main.js` - Processo principal do Electron, gerencia a janela da aplicação e a comunicação com o cliente do LoL
- `renderer.js` - Processo de renderização, lida com a interface do usuário e eventos
- `src/lcu-api.js` - API para comunicação com o cliente do League of Legends
- `room-manager.js` - Gerenciamento das salas e jogadores
- `index.html` - Interface principal da aplicação
- `styles.css` - Estilos da aplicação

## 🔧 Principais Funcionalidades

### Conexão com o Cliente do LoL (`src/lcu-api.js`)
- Conecta automaticamente ao cliente do LoL quando ele está aberto
- Obtém informações do invocador e ranks
- Cria e gerencia lobbies

### Gerenciamento de Salas (`room-manager.js`)
- Criação de salas com:
  - Posições primária e secundária
  - Elo mínimo requerido
  - Posições necessárias
- Juntar-se a salas existentes
- Cancelar salas

### Interface do Usuário (`renderer.js`)
- Exibe status de conexão com o cliente
- Lista de salas disponíveis
- Modal de criação de sala
- Modal de login required
- Filtros de salas por posição

## 💡 Guia de Desenvolvimento

### Processo Principal vs Renderer

O Electron usa dois tipos de processos:
1. **Processo Principal** (`main.js`):
   - Gerencia janelas
   - Comunica com o sistema operacional
   - Lida com a API do LoL

2. **Processo Renderer** (`renderer.js`):
   - Interface do usuário
   - Eventos do DOM
   - Comunicação com o processo principal via IPC

### Comunicação IPC

Para comunicar entre os processos:

```javascript
// No renderer.js (enviando)
const result = await ipcRenderer.invoke('channel-name', data);

// No main.js (recebendo)
ipcMain.handle('channel-name', async (event, data) => {
    // Processa data
    return result;
});
```

### LCU API

A comunicação com o cliente do LoL usa a LCU API:
- Autenticação automática
- Endpoints principais:
  - `/lol-summoner/v1/current-summoner`
  - `/lol-lobby/v2/lobby`
  - `/lol-lobby/v2/lobby/members/localMember/position-preferences`

## 🎨 Estilização

O projeto usa:
- Bootstrap 5.3.2 para layout e componentes
- Font Awesome 6.0.0 para ícones
- CSS customizado em `styles.css`

### Classes CSS Importantes
- `.client-status` - Status de conexão
- `.elo-badge` - Badges de elo
- `.room-card` - Cards de sala

## 🐛 Depuração

1. Execute com modo de desenvolvedor:
```bash
npm start -- --debug
```

2. Use `console.log()` estrategicamente:
```javascript
// No main.js
console.log('Processo principal:', data);

// No renderer.js
console.log('Interface:', data);
```

## 📝 Convenções de Código

1. Use nomes descritivos em inglês para variáveis e funções
2. Comente código complexo
3. Mantenha funções pequenas e focadas
4. Use async/await para código assíncrono
5. Trate erros adequadamente

## ⚠️ Notas Importantes

- O cliente do LoL precisa estar aberto para usar o app
- A aplicação se conecta automaticamente quando detecta o cliente
- Todas as posições são salvas em MAIÚSCULAS
- UTILITY é convertido para SUPPORT na interface
