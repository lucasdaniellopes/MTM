const Store = require('electron-store');
const { v4: uuidv4 } = require('uuid');
const { EventEmitter } = require('events');

class RoomManager extends EventEmitter {
    constructor() {
        super();
        this.store = new Store();
        const storedRooms = this.store.get('rooms', {});
        this.rooms = new Map(Object.entries(storedRooms));
        this.cleanupInterval = setInterval(() => this.cleanupStaleRooms(), 60000);
    }

    createRoom(data) {
        console.log('Creating room with data:', data);
        
        const roomId = uuidv4();
        const room = {
            id: roomId,
            minElo: data.minElo,
            status: 'open',
            players: [{
                summoner: {
                    displayName: data.summoner.displayName,
                    puuid: data.summoner.puuid,
                    id: data.summoner.summonerId
                },
                position: data.hostPosition,
                secondaryPosition: data.secondaryPosition
            }],
            neededPositions: data.neededPositions || [],
            createdAt: Date.now()
        };

        console.log('Room created:', room);
        
        this.rooms.set(roomId, room);
        this.saveRooms();
        this.emit('roomCreated', room);
        return room;
    }

    getNeededPositions(primaryPosition, secondaryPosition) {
        const allPositions = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'];
        
        // Se a posição primária é FILL, não precisamos de nenhuma posição específica
        if (primaryPosition === 'FILL') {
            return [];
        }
        
        // Remove a posição primária e secundária das posições necessárias
        return allPositions.filter(pos => 
            pos !== primaryPosition && 
            (secondaryPosition === 'FILL' ? true : pos !== secondaryPosition)
        );
    }

    getRoom(roomId) {
        console.log('Buscando sala:', roomId); // Debug log
        console.log('Salas disponíveis:', Array.from(this.rooms.entries())); // Debug log
        return this.rooms.get(roomId);
    }

    getAllRooms() {
        console.log('Todas as salas:', Array.from(this.rooms.values())); // Debug log
        return Array.from(this.rooms.values())
            .filter(room => room.status === 'open')
            .sort((a, b) => b.createdAt - a.createdAt);
    }

    updateRoom(roomId, updates) {
        if (!this.rooms.has(roomId)) {
            throw new Error('Room not found');
        }

        const room = this.rooms.get(roomId);
        this.rooms.set(roomId, {
            ...room,
            ...updates,
            updatedAt: Date.now()
        });

        this.saveRooms();
        this.emit('roomUpdated', this.rooms.get(roomId));
        return this.rooms.get(roomId);
    }

    joinRoom(roomId, player) {
        const room = this.getRoom(roomId);
        if (!room) {
            throw new Error('Room not found');
        }

        if (room.status !== 'open') {
            throw new Error('Room is not open');
        }

        if (!room.neededPositions.includes(player.position)) {
            throw new Error('Position not needed');
        }

        room.players.push({
            summoner: {
                displayName: player.summoner.displayName || `${player.summoner.gameName}#${player.summoner.tagLine}`,
                puuid: player.summoner.puuid,
                id: player.summoner.summonerId
            },
            position: player.position
        });

        room.neededPositions = room.neededPositions.filter(pos => pos !== player.position);

        if (room.players.length === 5) {
            room.status = 'full';
        }

        this.updateRoom(roomId, room);
        return room;
    }

    leaveRoom(roomId, summonerName) {
        const room = this.getRoom(roomId);
        if (!room) {
            throw new Error('Room not found');
        }

        const playerIndex = room.players.findIndex(p => p.summoner.displayName === summonerName);
        if (playerIndex === -1) {
            throw new Error('Player not in room');
        }

        room.players.splice(playerIndex, 1);
        
        if (room.players.length === 0) {
            this.removeRoom(roomId);
        } else {
            room.status = 'open';
            this.updateRoom(roomId, room);
        }

        this.saveRooms();
        this.emit('roomUpdated', room);
        return room;
    }

    cancelRoom(roomId) {
        const room = this.rooms.get(roomId);
        if (!room) {
            throw new Error('Sala não encontrada');
        }
        
        this.rooms.delete(roomId);
        this.saveRooms();
        this.emit('roomCanceled', roomId);
        return true;
    }

    cleanupStaleRooms() {
        const now = Date.now();
        const staleThreshold = 30 * 60 * 1000; // 30 minutes

        Array.from(this.rooms.entries()).forEach(([roomId, room]) => {
            if (now - room.createdAt > staleThreshold) {
                this.removeRoom(roomId);
                this.emit('roomDeleted', roomId);
            }
        });

        this.saveRooms();
    }

    saveRooms() {
        // Convert Map to object before storing
        const roomsObj = Object.fromEntries(this.rooms);
        this.store.set('rooms', roomsObj);
    }

    filterRooms(filters) {
        return this.getAllRooms().filter(room => {
            if (filters.elo && room.minElo !== filters.elo) {
                return false;
            }
            if (filters.position && !room.neededPositions.includes(filters.position)) {
                return false;
            }
            return true;
        });
    }

    removeRoom(roomId) {
        return this.rooms.delete(roomId);
    }

    clearAllRooms() {
        this.rooms.clear();
        this.store.delete('rooms');
        this.emit('roomsCleared');
    }
}

module.exports = new RoomManager();
