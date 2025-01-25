const MockDB = {
    players: null,
    fileHandle: null,

    // Default players data
    defaultPlayers: {
        "player1": {
            "username": "Alex",
            "avatar": "🚀",
            "color": "#FF0000",
            "lastSeen": Date.now(),
            "position": {
                "x": 5,
                "y": 5
            }
        },
        "player2": {
            "username": "Bob",
            "avatar": "🎮",
            "color": "#00FF00",
            "lastSeen": Date.now(),
            "position": {
                "x": -3,
                "y": 2
            }
        },
        "player3": {
            "username": "Charlie",
            "avatar": "💎",
            "color": "#0000FF",
            "lastSeen": Date.now(),
            "position": {
                "x": 2,
                "y": -4
            }
        },
        "player4": {
            "username": "Diana",
            "avatar": "🌈",
            "color": "#FF8000",
            "lastSeen": Date.now(),
            "position": {
                "x": -5,
                "y": -5
            }
        },
        "player5": {
            "username": "Eve",
            "avatar": "⭐️",
            "color": "#6600FF",
            "lastSeen": Date.now(),
            "position": {
                "x": 8,
                "y": -2
            }
        }
    },

    // Request permission and get file handle
    requestFileAccess: async function () {
        try {
            // Request permission to access the file
            this.fileHandle = await window.showSaveFilePicker({
                suggestedName: 'players.json',
                types: [{
                    description: 'JSON File',
                    accept: { 'application/json': ['.json'] },
                }],
            });
            return true;
        } catch (error) {
            console.error('Failed to get file access:', error);
            return false;
        }
    },

    // Load players from file
    loadPlayers: async function () {
        try {
            if (!this.fileHandle) {
                const hasAccess = await this.requestFileAccess();
                if (!hasAccess) {
                    throw new Error('No file access granted');
                }
            }

            // Read the file
            const file = await this.fileHandle.getFile();
            const contents = await file.text();

            try {
                if (!contents.trim()) {
                    // Empty file, initialize with default players
                    console.log('Empty file, initializing with default players');
                    this.players = this.defaultPlayers;
                    await this.savePlayers();
                } else {
                    const data = JSON.parse(contents);
                    if (!data.players || Object.keys(data.players).length === 0) {
                        // No players or empty players object, initialize with defaults
                        console.log('No players found, initializing with default players');
                        this.players = this.defaultPlayers;
                        await this.savePlayers();
                    } else {
                        this.players = data.players;
                    }
                }
            } catch (e) {
                // Invalid JSON, initialize with default players
                console.log('Invalid JSON, initializing with default players');
                this.players = this.defaultPlayers;
                await this.savePlayers();
            }
        } catch (error) {
            console.error('Error loading players:', error);
            this.players = this.defaultPlayers;
        }
    },

    // Save players to file
    savePlayers: async function () {
        try {
            if (!this.fileHandle) {
                const hasAccess = await this.requestFileAccess();
                if (!hasAccess) {
                    throw new Error('No file access granted');
                }
            }

            // Create a FileSystemWritableFileStream to write to
            const writable = await this.fileHandle.createWritable();

            // Write the file
            await writable.write(JSON.stringify({ players: this.players }, null, 4));
            await writable.close();
        } catch (error) {
            console.error('Error saving players:', error);
            alert('Failed to save player data. Please ensure you granted file access permissions.');
        }
    },

    // Initialize the DB
    init: async function () {
        await this.loadPlayers();
        if (!this.players) {
            this.players = {};
            await this.savePlayers();
        }
    },

    // Mock database methods
    getPlayer: async function (username) {
        // Ensure players is loaded
        if (!this.players) {
            await this.loadPlayers();
        }
        return Object.values(this.players).find(p => p.username === username);
    },

    getOnlinePlayers: async function () {
        // Ensure players is loaded
        if (!this.players) {
            await this.loadPlayers();
        }
        const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
        return Object.values(this.players).filter(p => p.lastSeen > fiveMinutesAgo);
    },

    updatePlayerPosition: async function (username, x, y) {
        const player = await this.getPlayer(username);
        if (player) {
            player.position.x = x;
            player.position.y = y;
            player.lastSeen = Date.now();
            await this.savePlayers();
        }
    },

    updatePlayerLastSeen: async function (username) {
        const player = await this.getPlayer(username);
        if (player) {
            player.lastSeen = Date.now();
            await this.savePlayers();
        }
    },

    addOrUpdatePlayer: async function (playerData) {
        const playerId = `player_${playerData.username}`;
        this.players[playerId] = {
            username: playerData.username,
            avatar: playerData.avatar,
            color: playerData.color,
            lastSeen: Date.now(),
            position: {
                x: playerData.x || 0,
                y: playerData.y || 0
            }
        };
        await this.savePlayers();
    }
}; 