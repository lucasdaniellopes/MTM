const axios = require('axios');
const https = require('https');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const { exec } = require('child_process');

class LCUApi {
    constructor() {
        this.credentials = null;
        this.baseUrl = null;
        this.wsUrl = null;
        this.ws = null;
        this.httpsAgent = new https.Agent({
            rejectUnauthorized: false
        });
        this.eventHandlers = new Map();
    }

    async initialize() {
        try {
            await this.findLeagueClient();
            await this.readLockfile();
            this.setupWebSocket();
            return true;
        } catch (error) {
            console.error('Failed to initialize LCU API:', error);
            return false;
        }
    }

    async findLeagueClient() {
        return new Promise((resolve, reject) => {
            exec('tasklist /fi "imagename eq LeagueClient.exe"', (error, stdout) => {
                if (error) {
                    reject(new Error('Error checking for League Client process'));
                    return;
                }
                
                if (!stdout.includes('LeagueClient.exe')) {
                    reject(new Error('League Client is not running'));
                    return;
                }
                
                resolve();
            });
        });
    }

    async readLockfile() {
        const possiblePaths = [
            path.join(process.env['LOCALAPPDATA'], 'Riot Games', 'League of Legends', 'lockfile'),
            'C:\\Riot Games\\League of Legends\\lockfile',
            'D:\\Riot Games\\League of Legends\\lockfile'
        ];

        for (const lockfilePath of possiblePaths) {
            try {
                if (fs.existsSync(lockfilePath)) {
                    const content = fs.readFileSync(lockfilePath, 'utf8');
                    const [processName, pid, port, password, protocol] = content.split(':');
                    
                    this.credentials = Buffer.from(`riot:${password}`).toString('base64');
                    this.baseUrl = `${protocol}://127.0.0.1:${port}`;
                    this.wsUrl = `wss://127.0.0.1:${port}/`;
                    console.log('Found lockfile at:', lockfilePath);
                    return;
                }
            } catch (error) {
                console.error(`Error reading lockfile at ${lockfilePath}:`, error);
            }
        }

        throw new Error('Could not find or read lockfile');
    }

    setupWebSocket() {
        try {
            this.ws = new WebSocket(this.wsUrl, {
                headers: {
                    'Authorization': `Basic ${this.credentials}`
                },
                rejectUnauthorized: false
            });

            this.ws.on('open', () => {
                console.log('WebSocket connected to League Client');
                this.subscribe('/lol-gameflow/v1/gameflow-phase');
            });

            this.ws.on('message', (data) => {
                try {
                    // First try to parse as a regular JSON message
                    const message = JSON.parse(data.toString());
                    
                    // Check if it's an array with the expected format [type, event, payload]
                    if (Array.isArray(message) && message.length >= 2) {
                        const [type, event, payload] = message;
                        if (type === 8 && event) {
                            const handlers = this.eventHandlers.get(event);
                            if (handlers) {
                                handlers.forEach(handler => {
                                    try {
                                        handler(payload);
                                    } catch (handlerError) {
                                        console.error('Error in event handler:', handlerError);
                                    }
                                });
                            }
                        }
                    } else {
                        // Handle regular JSON messages
                        console.log('Received non-event WebSocket message:', message);
                    }
                } catch (parseError) {
                    console.error('Error parsing WebSocket message:', parseError);
                    console.debug('Raw message:', data.toString().slice(0, 200)); // Only log first 200 chars to avoid spam
                }
            });

            this.ws.on('error', (error) => {
                console.error('WebSocket error:', error);
            });

            this.ws.on('close', () => {
                console.log('WebSocket disconnected');
                // Attempt to reconnect after a delay
                setTimeout(() => this.setupWebSocket(), 5000);
            });
        } catch (error) {
            console.error('Error setting up WebSocket:', error);
        }
    }

    subscribe(endpoint, handler) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            const eventName = 'OnJsonApiEvent' + endpoint;
            this.ws.send(JSON.stringify([5, eventName]));

            if (handler) {
                if (!this.eventHandlers.has(eventName)) {
                    this.eventHandlers.set(eventName, new Set());
                }
                this.eventHandlers.get(eventName).add(handler);
            }
        }
    }

    unsubscribe(endpoint, handler) {
        const eventName = 'OnJsonApiEvent' + endpoint;
        if (handler && this.eventHandlers.has(eventName)) {
            this.eventHandlers.get(eventName).delete(handler);
        }
    }

    async request(method, endpoint, data = null) {
        try {
            const config = {
                method,
                url: this.baseUrl + endpoint,
                headers: {
                    'Authorization': `Basic ${this.credentials}`,
                    'Content-Type': 'application/json'
                },
                httpsAgent: this.httpsAgent
            };

            if (data) {
                config.data = data;
            }

            const response = await axios(config);
            return response.data;
        } catch (error) {
            console.error(`Error in ${method} request to ${endpoint}:`, error.response?.data || error.message);
            throw error;
        }
    }

    async getCurrentSummoner() {
        try {
            const response = await this.request('GET', '/lol-summoner/v1/current-summoner');
            console.log('Current summoner:', response);
            
            // If gameName and tagLine are available, use those (new Riot ID format)
            if (response.gameName && response.tagLine) {
                response.displayName = `${response.gameName}#${response.tagLine}`;
            } else if (response.displayName) {
                // Keep existing display name if available
                response.displayName = response.displayName;
            } else {
                // Fallback to summoner name
                response.displayName = response.summonerName;
            }
            
            return response;
        } catch (error) {
            console.error('Error getting current summoner:', error);
            throw error;
        }
    }

    async getRankedStats(puuid) {
        try {
            console.log('Fetching ranked stats for puuid:', puuid);
            const response = await this.request('GET', `/lol-ranked/v1/current-ranked-stats`);
            console.log('Ranked stats response:', response);
            
            // Format the ranked stats to match expected structure
            const formattedStats = {
                queueMap: {}
            };
            
            if (response && response.queues) {
                response.queues.forEach(queue => {
                    if (queue.queueType === 'RANKED_SOLO_5x5') {
                        formattedStats.queueMap.RANKED_SOLO_5x5 = {
                            tier: queue.tier || 'UNRANKED',
                            division: queue.division || 'NA',
                            leaguePoints: queue.leaguePoints || 0
                        };
                    } else if (queue.queueType === 'RANKED_FLEX_SR') {
                        formattedStats.queueMap.RANKED_FLEX_SR = {
                            tier: queue.tier || 'UNRANKED',
                            division: queue.division || 'NA',
                            leaguePoints: queue.leaguePoints || 0
                        };
                    }
                });
            }
            
            return formattedStats;
        } catch (error) {
            console.error('Error getting ranked stats:', error);
            return {
                queueMap: {
                    RANKED_SOLO_5x5: { tier: 'UNRANKED', division: 'NA', leaguePoints: 0 },
                    RANKED_FLEX_SR: { tier: 'UNRANKED', division: 'NA', leaguePoints: 0 }
                }
            };
        }
    }

    async createLobby(queueId = 440, position) { // 440 is the queue ID for Flex 5v5
        try {
            // Primeiro cria o lobby
            const lobbyResponse = await this.request('POST', '/lol-lobby/v2/lobby', {
                queueId: queueId,
                gameMode: "CLASSIC",
                teamSize: 5,
                mapId: 11
            });

            // Se a posição foi especificada, define a posição do jogador
            if (position) {
                await this.setPositionPreferences(position);
            }

            console.log('Created lobby:', lobbyResponse);
            return lobbyResponse;
        } catch (error) {
            console.error('Error creating lobby:', error);
            throw error;
        }
    }

    async setPositionPreferences(firstPosition, secondPosition = 'FILL') {
        try {
            // Converte as posições para o formato correto do cliente
            const positions = {
                'top': 'TOP',
                'jungle': 'JUNGLE',
                'mid': 'MIDDLE',
                'adc': 'BOTTOM',
                'sup': 'UTILITY',
                'fill': 'FILL'
            };

            const firstPref = positions[firstPosition.toLowerCase()] || firstPosition.toUpperCase();
            const secondPref = positions[secondPosition.toLowerCase()] || secondPosition.toUpperCase();

            console.log('Setting position preferences:', firstPref, secondPref);
            
            const response = await this.request('PUT', '/lol-lobby/v2/lobby/members/localMember/position-preferences', {
                firstPreference: firstPref,
                secondPreference: secondPref
            });
            
            console.log('Position preferences set:', response);
            return response;
        } catch (error) {
            console.error('Error setting position preferences:', error);
            throw error;
        }
    }

    async getLobbyMembers() {
        try {
            const response = await this.request('GET', '/lol-lobby/v2/lobby/members');
            console.log('Lobby members:', response);
            return response;
        } catch (error) {
            console.error('Error getting lobby members:', error);
            throw error;
        }
    }

    async inviteToLobby(summonerNames) {
        return this.request('POST', '/lol-lobby/v2/lobby/invitations', {
            invitations: summonerNames.map(name => ({ toSummonerName: name }))
        });
    }

    async getGameflowPhase() {
        return this.request('GET', '/lol-gameflow/v1/gameflow-phase');
    }

    async destroyLobby() {
        try {
            await this.request('DELETE', '/lol-lobby/v2/lobby');
            console.log('Lobby destroyed');
            return true;
        } catch (error) {
            console.error('Error destroying lobby:', error);
            throw error;
        }
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }
}

module.exports = new LCUApi();
