const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const Store = require('electron-store');
const lcuApi = require('./src/lcu-api');
const roomManager = require('./room-manager');

const store = new Store();

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile('index.html');
  
  if (process.argv.includes('--debug')) {
    mainWindow.webContents.openDevTools();
  }
}

async function connectToLeagueClient() {
  try {
    const isConnected = await lcuApi.initialize();
    console.log('League Client connection status:', isConnected);

    if (!isConnected) {
      return { isConnected: false };
    }

    const summoner = await lcuApi.getCurrentSummoner();
    console.log('Current summoner:', summoner);

    if (!summoner) {
      console.log('No summoner data available');
      return { isConnected: false };
    }

    const rankedStats = await lcuApi.getRankedStats(summoner.summonerId);
    console.log('Ranked stats:', rankedStats);

    if (!rankedStats) {
      console.log('No ranked stats available');
      return { isConnected: true, summoner, rankedStats: { queueMap: {} } };
    }

    const formattedStats = {
      queueMap: {
        RANKED_SOLO_5x5: rankedStats.queueMap?.RANKED_SOLO_5x5 || null,
        RANKED_FLEX_SR: rankedStats.queueMap?.RANKED_FLEX_SR || null
      }
    };

    return { isConnected: true, summoner, rankedStats: formattedStats };
  } catch (error) {
    console.error('Failed to connect to League Client:', error);
    return { isConnected: false, error: error.message };
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC handlers
ipcMain.handle('check-league-client', async () => {
  return await connectToLeagueClient();
});

ipcMain.handle('get-rooms', (event, filters) => {
  return roomManager.filterRooms(filters);
});

ipcMain.handle('create-room', async (event, data) => {
  try {
    // Get current summoner data first
    const currentSummoner = await lcuApi.getCurrentSummoner();
    if (!currentSummoner) {
      throw new Error('Could not get current summoner data');
    }
    
    // Update summoner data in the request
    data.summoner = currentSummoner;

    // Create lobby in League Client
    await lcuApi.createLobby(
      440, // Queue ID for Flex 5v5
      data.positions.primary,
      data.positions.secondary
    );
    
    // Create room in our system
    const room = roomManager.createRoom({
      ...data,
      hostPosition: data.positions.primary,
      secondaryPosition: data.positions.secondary
    });

    console.log('Room created:', room);
    return room;
  } catch (error) {
    console.error('Failed to create room:', error);
    throw error;
  }
});

ipcMain.handle('join-room', async (event, roomId) => {
  try {
    const { isConnected, summoner, error } = await connectToLeagueClient();
    if (!isConnected) {
      throw new Error(error || 'League Client not connected');
    }

    const room = roomManager.getRoom(roomId);
    if (!room) {
      throw new Error('Room not found');
    }

    // Invite player to lobby
    await lcuApi.inviteToLobby(room.players[0].summoner.name);

    return roomManager.joinRoom(roomId, {
      summoner,
      position: room.neededPositions[0] // Assign first needed position
    });
  } catch (error) {
    console.error('Failed to join room:', error);
    throw error;
  }
});

ipcMain.handle('cancel-room', async (event, roomId) => {
  try {
    // Primeiro verifica se o usuário é dono da sala
    const room = roomManager.getRoom(roomId);
    if (!room) {
      throw new Error('Sala não encontrada');
    }

    const currentSummoner = await lcuApi.getCurrentSummoner();
    if (!currentSummoner || room.players[0].summoner.puuid !== currentSummoner.puuid) {
      throw new Error('Você não tem permissão para cancelar esta sala');
    }

    // Destrói o lobby no cliente
    await lcuApi.destroyLobby();
    
    // Remove a sala do sistema
    roomManager.cancelRoom(roomId);
    
    return true;
  } catch (error) {
    console.error('Failed to cancel room:', error);
    throw error;
  }
});

ipcMain.handle('clear-all-rooms', async () => {
  try {
    roomManager.clearAllRooms();
    return true;
  } catch (error) {
    console.error('Failed to clear rooms:', error);
    throw error;
  }
});

// Room events
roomManager.on('roomCreated', (room) => {
  mainWindow?.webContents.send('room-update', { type: 'created', room });
});

roomManager.on('roomUpdated', (room) => {
  mainWindow?.webContents.send('room-update', { type: 'updated', room });
});

roomManager.on('roomDeleted', (roomId) => {
  mainWindow?.webContents.send('room-update', { type: 'deleted', roomId });
});
