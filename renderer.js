const { ipcRenderer } = require('electron');

// DOM Elements
const clientStatus = document.getElementById('client-status');
const summonerInfo = document.getElementById('summoner-info');
const summonerName = document.getElementById('summoner-name');
const createRoomBtn = document.getElementById('create-room-btn');
const createRoomModal = document.getElementById('createRoomModal');
const createRoomForm = document.getElementById('create-room-form');
const createRoomSubmit = document.getElementById('create-room-submit');
const roomsContainer = document.getElementById('rooms-container');
const eloFilter = document.getElementById('elo-filter');
const positionFilter = document.getElementById('position-filter');
const soloRank = document.getElementById('solo-rank');
const flexRank = document.getElementById('flex-rank');
const loginRequiredModal = document.getElementById('loginRequiredModal');
let loginModal = null;

let currentSummoner = null;
let currentRankedStats = null;

// Check League Client connection status
async function checkLeagueClient() {
    try {
        const { isConnected, summoner, rankedStats } = await ipcRenderer.invoke('check-league-client');
        
        if (!isConnected) {
            if (!loginModal) {
                loginModal = new bootstrap.Modal(loginRequiredModal);
            }
            loginModal.show();
            return;
        } else if (loginModal) {
            loginModal.hide();
        }

        if (isConnected && summoner) {
            // Update connection status
            clientStatus.textContent = 'League Client: Connected';
            clientStatus.className = 'client-status client-connected';
            
            // Update summoner info
            currentSummoner = summoner;
            console.log('Summoner atualizado:', currentSummoner); // Debug log
            
            summonerInfo.classList.remove('d-none');
            summonerName.textContent = summoner.displayName;
            
            // Update ranked stats
            if (rankedStats) {
                currentRankedStats = rankedStats;
                updateRankedDisplay(rankedStats);
            }
            
            // Enable create room button
            createRoomBtn.disabled = false;
        } else {
            // Reset to disconnected state
            clientStatus.textContent = 'League Client: Disconnected';
            clientStatus.className = 'client-status client-disconnected';
            summonerInfo.classList.add('d-none');
            currentSummoner = null;
            currentRankedStats = null;
            createRoomBtn.disabled = true;
            
            // Reset ranked display
            soloRank.textContent = 'Unranked';
            flexRank.textContent = 'Unranked';
        }
    } catch (error) {
        console.error('Error checking League Client:', error);
        clientStatus.textContent = 'League Client: Error';
        clientStatus.className = 'client-status client-disconnected';
    }
}

// Format rank display
function formatRank(queueStats) {
    if (!queueStats || !queueStats.tier || queueStats.tier === '') {
        return 'Unranked';
    }
    
    const tier = queueStats.tier.charAt(0) + queueStats.tier.slice(1).toLowerCase();
    const division = queueStats.division === 'NA' ? '' : ` ${queueStats.division}`;
    const lp = queueStats.leaguePoints ? ` (${queueStats.leaguePoints} LP)` : '';
    
    return `${tier}${division}${lp}`;
}

// Update ranked stats display
function updateRankedDisplay(rankedStats) {
    if (!rankedStats || !rankedStats.queueMap) {
        soloRank.textContent = 'Unranked';
        flexRank.textContent = 'Unranked';
        return;
    }
    
    const soloQueue = rankedStats.queueMap.RANKED_SOLO_5x5;
    const flexQueue = rankedStats.queueMap.RANKED_FLEX_SR;
    
    // Clear previous rank classes
    soloRank.className = '';
    flexRank.className = '';
    
    // Update Solo/Duo rank
    if (soloQueue && soloQueue.tier) {
        const tier = soloQueue.tier.charAt(0) + soloQueue.tier.slice(1).toLowerCase();
        const division = soloQueue.division === 'NA' ? '' : ` ${soloQueue.division}`;
        const lp = soloQueue.leaguePoints ? ` (${soloQueue.leaguePoints} LP)` : '';
        soloRank.textContent = `${tier}${division}${lp}`;
        soloRank.classList.add(`rank-${soloQueue.tier.toLowerCase()}`);
    } else {
        soloRank.textContent = 'Unranked';
    }
    
    // Update Flex rank
    if (flexQueue && flexQueue.tier) {
        const tier = flexQueue.tier.charAt(0) + flexQueue.tier.slice(1).toLowerCase();
        const division = flexQueue.division === 'NA' ? '' : ` ${flexQueue.division}`;
        const lp = flexQueue.leaguePoints ? ` (${flexQueue.leaguePoints} LP)` : '';
        flexRank.textContent = `${tier}${division}${lp}`;
        flexRank.classList.add(`rank-${flexQueue.tier.toLowerCase()}`);
    } else {
        flexRank.textContent = 'Unranked';
    }
}

// Get player's flex rank
function getFlexRank() {
    if (!currentRankedStats || !currentRankedStats.queueMap) {
        return null;
    }
    
    const flexQueue = currentRankedStats.queueMap.RANKED_FLEX_SR;
    if (!flexQueue) {
        return 'UNRANKED';
    }
    
    return flexQueue.tier;
}

// Create a room card
function createRoomCard(room) {
    const card = document.createElement('div');
    card.className = 'col-md-6 col-lg-4 mb-4';
    
    // Debug logs
    console.log('Creating card for room:', room.id);
    console.log('Current summoner:', currentSummoner);
    console.log('Room owner:', room.players[0].summoner);
    console.log('Is owner?', currentSummoner && room.players[0].summoner.puuid === currentSummoner.puuid);
    
    // Check if current user is the room owner
    const isOwner = currentSummoner && room.players[0].summoner.puuid === currentSummoner.puuid;
    
    // Helper function to format position names
    function formatPosition(position) {
        if (position === 'UTILITY') return 'SUPPORT';
        return position;
    }
    
    // Format owner positions
    const ownerPositions = room.players[0].secondaryPosition === 'FILL' 
        ? `<span class="badge bg-secondary">${formatPosition(room.players[0].position)}</span>`
        : `<span class="badge bg-secondary">${formatPosition(room.players[0].position)}</span>
           <span class="badge bg-accent">${formatPosition(room.players[0].secondaryPosition)}</span>`;
    
    card.innerHTML = `
        <div class="card room-card">
            <div class="card-body">
                <div class="d-flex justify-content-between align-items-center mb-3">
                    <span class="elo-badge elo-${room.minElo.toLowerCase()}">${room.minElo}</span>
                    <span class="badge bg-accent">${room.players.length}/5 Players</span>
                </div>
                <div class="mb-3">
                    <h6 class="card-subtitle mb-2 text-secondary">Host</h6>
                    <div class="d-flex align-items-center flex-wrap gap-2">
                        ${ownerPositions}
                        <span class="text-highlight">${room.players[0].summoner.displayName}</span>
                    </div>
                </div>
                <div class="mb-3">
                    <h6 class="card-subtitle mb-2 text-secondary">Looking for</h6>
                    <div class="d-flex flex-wrap gap-2">
                        ${room.neededPositions.map(pos => `
                            <span class="badge bg-accent">${formatPosition(pos)}</span>
                        `).join('')}
                    </div>
                </div>
                ${isOwner ? `
                    <button class="btn btn-danger w-100" onclick="cancelRoom('${room.id}')">
                        Cancel Room
                    </button>
                ` : `
                    <button class="btn btn-primary w-100" onclick="joinRoom('${room.id}')">
                        Join Room
                    </button>
                `}
            </div>
        </div>
    `;
    return card;
}

// Cancel a room
async function cancelRoom(roomId) {
    try {
        await ipcRenderer.invoke('cancel-room', roomId);
        await updateRooms();
    } catch (error) {
        console.error('Failed to cancel room:', error);
        alert(error.message);
    }
}

// Update rooms display
async function updateRooms() {
    const filters = {
        elo: eloFilter.value,
        position: positionFilter.value
    };

    const rooms = await ipcRenderer.invoke('get-rooms', filters);
    roomsContainer.innerHTML = '';
    
    if (rooms.length === 0) {
        roomsContainer.innerHTML = `
            <div class="col-12 text-center text-muted">
                <h5>No rooms available</h5>
                <p>Create a room to get started!</p>
            </div>
        `;
        return;
    }

    rooms.forEach(room => {
        roomsContainer.appendChild(createRoomCard(room));
    });
}

// Join a room
async function joinRoom(roomId) {
    try {
        await ipcRenderer.invoke('join-room', roomId);
        updateRooms();
    } catch (error) {
        console.error('Failed to join room:', error);
        alert(error.message);
    }
}

// Create room button handler
createRoomBtn.addEventListener('click', async () => {
    if (!currentSummoner) {
        alert('Por favor, conecte-se ao cliente do League of Legends primeiro');
        return;
    }
    const modal = new bootstrap.Modal(createRoomModal);
    modal.show();
});

// Create room form handler
document.getElementById('create-room-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    try {
        const primaryPosition = document.getElementById('primary-position').value;
        const secondaryPosition = document.getElementById('secondary-position').value;
        const minEloSelect = document.querySelector('select[name="minElo"]');
        const positionsCheckboxes = document.querySelectorAll('input[name="positions"]:checked');
        
        // Get selected positions
        const neededPositions = Array.from(positionsCheckboxes).map(cb => cb.value);
        
        const room = await ipcRenderer.invoke('create-room', {
            positions: {
                primary: primaryPosition || 'FILL',
                secondary: secondaryPosition || (primaryPosition === 'FILL' ? 'FILL' : primaryPosition)
            },
            minElo: minEloSelect.value || 'IRON',
            neededPositions: neededPositions
        });
        
        // Close the modal after creating the room
        const modal = bootstrap.Modal.getInstance(createRoomModal);
        modal.hide();
        
        // Clear the form
        document.getElementById('primary-position').value = 'FILL';
        document.getElementById('secondary-position').value = 'FILL';
        minEloSelect.value = 'IRON';
        positionsCheckboxes.forEach(cb => cb.checked = false);
        
        // Update rooms list
        updateRooms();
    } catch (error) {
        console.error('Failed to create room:', error);
        alert('Error creating room: ' + error.message);
    }
});

// Filter rooms
function filterRooms() {
    updateRooms();
}

// Handle room updates from main process
ipcRenderer.on('room-update', async (event, update) => {
    await updateRooms();
});

eloFilter.addEventListener('change', filterRooms);
positionFilter.addEventListener('change', filterRooms);

// Clear all rooms
async function clearAllRooms() {
    try {
        await ipcRenderer.invoke('clear-all-rooms');
        updateRooms();
    } catch (error) {
        console.error('Failed to clear rooms:', error);
        alert('Erro ao limpar salas: ' + error.message);
    }
}

// Initial setup
document.addEventListener('DOMContentLoaded', () => {
    checkLeagueClient();
    updateRooms();
    setInterval(checkLeagueClient, 5000); // Check connection every 5 seconds
    setInterval(updateRooms, 10000); // Update rooms every 10 seconds

    const clearButton = document.createElement('button');
    clearButton.className = 'btn btn-danger mb-3';
    clearButton.textContent = 'Clean All Rooms';
    clearButton.onclick = clearAllRooms;
    
    // Adiciona o botão antes da lista de salas
    const roomsList = document.getElementById('rooms-container');
    roomsList.parentNode.insertBefore(clearButton, roomsList);
});
