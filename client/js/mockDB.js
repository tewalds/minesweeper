const MockDB = {
    players: null,
    fileHandle: null,

    // Default players data
    defaultPlayers: {
        "player1": {
            "username": "Anton",
            "avatar": "🚀",
            "color": "#FF0000",
            "position": {
                "x": 120,
                "y": 0
            }
        },
        "player2": {
            "username": "Bob",
            "avatar": "🎮",
            "color": "#00FF00",
            "position": {
                "x": 37,
                "y": 120
            }
        },
        "player3": {
            "username": "Charlie",
            "avatar": "💎",
            "color": "#0000FF",
            "position": {
                "x": -120,
                "y": 111
            }
        },
        "player4": {
            "username": "Diana",
            "avatar": "🌈",
            "color": "#FF8000",
            "position": {
                "x": -88,
                "y": 20
            }
        },
        "player5": {
            "username": "Eve",
            "avatar": "⭐️",
            "color": "#6600FF",
            "position": {
                "x": 85,
                "y": 85
            }
        }
    },

    // Load players from file
    loadPlayers: async function () {
        try {
            if (!this.fileHandle) {
                throw new Error('No file handle provided');
            }

            let contents = '';
            try {
                const file = await this.fileHandle.getFile();
                contents = await file.text();
            } catch (error) {
                console.error('Error reading players file:', error);
                this.players = this.defaultPlayers;
                await this.savePlayers();
                return;
            }

            try {
                if (!contents.trim()) {
                    console.log('Empty file, initializing with default players');
                    this.players = this.defaultPlayers;
                    await this.savePlayers();
                } else {
                    const data = JSON.parse(contents);
                    if (!data.players || Object.keys(data.players).length === 0) {
                        console.log('No players found, initializing with default players');
                        this.players = this.defaultPlayers;
                        await this.savePlayers();
                    } else {
                        this.players = data.players;
                    }
                }
            } catch (e) {
                console.error('Invalid JSON, initializing with default players');
                this.players = this.defaultPlayers;
                await this.savePlayers();
            }
        } catch (error) {
            console.error('Error in loadPlayers:', error);
            if (!this.players) {
                this.players = this.defaultPlayers;
            }
        }
    },

    // Save players to file
    savePlayers: async function () {
        try {
            if (!this.fileHandle) {
                throw new Error('No file handle provided');
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
        return Object.values(this.players);
    },

    updatePlayerPosition: async function (username, x, y) {
        const player = await this.getPlayer(username);
        if (player) {
            player.position.x = x;
            player.position.y = y;
            await this.savePlayers();
        }
    },

    updatePlayerLastSeen: async function (username) {
        // No-op now that we don't track timestamps
    },

    addOrUpdatePlayer: async function (playerData) {
        // Ensure players is loaded
        if (!this.players) {
            await this.loadPlayers();
        }

        // Remove any existing entries for this username
        Object.entries(this.players).forEach(([key, player]) => {
            if (player.username === playerData.username) {
                delete this.players[key];
            }
        });

        // Add new player data
        const playerId = `player_${playerData.username}`;
        this.players[playerId] = {
            username: playerData.username,
            avatar: playerData.avatar,
            color: playerData.color,
            position: {
                x: playerData.x || 0,
                y: playerData.y || 0
            }
        };

        await this.savePlayers();
    }
};