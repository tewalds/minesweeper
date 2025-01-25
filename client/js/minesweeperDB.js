const MinesweeperDB = {
    mines: null,
    fileHandle: null,

    // Initialize with 15% mines
    generateMines: function (gridSize) {
        const totalCells = gridSize * gridSize;
        const mineCount = Math.floor(totalCells * 0.15);
        const positions = [];

        while (positions.length < mineCount) {
            const x = Math.floor(Math.random() * gridSize);
            const y = Math.floor(Math.random() * gridSize);
            const pos = `${x},${y}`;

            // Check if position is already taken
            if (!positions.some(p => p.x === x && p.y === y)) {
                positions.push({ x, y });
            }
        }

        return positions;
    },

    // Default scores for initial players
    defaultScores: {
        "Anton": 42,
        "Bob": 27,
        "Charlie": 35,
        "Diana": 19,
        "Eve": 31
    },

    // Load mines data
    loadMines: async function () {
        try {
            if (!this.fileHandle) {
                throw new Error('No file handle provided');
            }

            let contents = '';
            try {
                const file = await this.fileHandle.getFile();
                contents = await file.text();
            } catch (error) {
                console.error('Error reading mines file:', error);
                // If we can't read the file, initialize with new data
                this.mines = {
                    positions: this.generateMines(30),
                    revealed: {},
                    markers: {},
                    scores: this.defaultScores
                };
                await this.saveMines();
                return;
            }

            try {
                if (!contents.trim()) {
                    // Empty file, initialize with new mines and default scores
                    this.mines = {
                        positions: this.generateMines(30),
                        revealed: {},
                        markers: {},
                        scores: this.defaultScores
                    };
                    await this.saveMines();
                } else {
                    const data = JSON.parse(contents);
                    if (!data.mines) {
                        this.mines = {
                            positions: this.generateMines(30),
                            revealed: {},
                            markers: {},
                            scores: this.defaultScores
                        };
                        await this.saveMines();
                    } else {
                        this.mines = data.mines;
                        // Ensure default players have scores
                        if (!this.mines.scores) {
                            this.mines.scores = this.defaultScores;
                            await this.saveMines();
                        }
                    }
                }
            } catch (e) {
                console.error('Invalid JSON, initializing with new mines');
                this.mines = {
                    positions: this.generateMines(30),
                    revealed: {},
                    markers: {},
                    scores: this.defaultScores
                };
                await this.saveMines();
            }
        } catch (error) {
            console.error('Error in loadMines:', error);
            // Ensure we always have valid data even if everything fails
            if (!this.mines) {
                this.mines = {
                    positions: this.generateMines(30),
                    revealed: {},
                    markers: {},
                    scores: this.defaultScores
                };
            }
        }
    },

    // Save mines to file
    saveMines: async function () {
        try {
            if (!this.fileHandle) {
                throw new Error('No file handle provided');
            }

            const writable = await this.fileHandle.createWritable();
            await writable.write(JSON.stringify({ mines: this.mines }, null, 4));
            await writable.close();
        } catch (error) {
            console.error('Error saving mines:', error);
            alert('Failed to save mines data. Please ensure you granted file access permissions.');
        }
    },

    // Initialize the DB
    init: async function () {
        await this.loadMines();
        if (!this.mines) {
            this.mines = {
                positions: this.generateMines(30),
                revealed: {},
                markers: {},
                scores: this.defaultScores
            };
            await this.saveMines();
        }
    },

    // Game methods
    isValidPosition: function (x, y) {
        return x >= 0 && x < 30 && y >= 0 && y < 30;
    },

    isMine: function (x, y) {
        if (!this.isValidPosition(x, y)) return false;
        return this.mines.positions.some(p => p.x === x && p.y === y);
    },

    getAdjacentMines: function (x, y) {
        if (!this.isValidPosition(x, y)) return 0;

        let count = 0;
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (dx === 0 && dy === 0) continue;
                const newX = x + dx;
                const newY = y + dy;
                if (this.isValidPosition(newX, newY) && this.isMine(newX, newY)) {
                    count++;
                }
            }
        }
        return count;
    },

    revealCell: async function (x, y, username) {
        if (!this.isValidPosition(x, y)) return false;

        const key = `${x},${y}`;
        if (this.mines.revealed[key]) return false;

        this.mines.revealed[key] = true;

        // If it's a mine, reset score
        if (this.isMine(x, y)) {
            this.mines.scores[username] = 0;
        } else {
            // Increment score
            this.mines.scores[username] = (this.mines.scores[username] || 0) + 1;

            // If empty cell, reveal neighbors
            if (this.getAdjacentMines(x, y) === 0) {
                for (let dx = -1; dx <= 1; dx++) {
                    for (let dy = -1; dy <= 1; dy++) {
                        if (dx === 0 && dy === 0) continue;
                        const newX = x + dx;
                        const newY = y + dy;
                        if (this.isValidPosition(newX, newY)) {
                            await this.revealCell(newX, newY, username);
                        }
                    }
                }
            }
        }

        await this.saveMines();
        return true;
    },

    toggleMarker: async function (x, y, username, avatar) {
        if (!this.isValidPosition(x, y)) return false;

        const key = `${x},${y}`;
        if (this.mines.revealed[key]) return false;

        if (this.mines.markers[key]?.username === username) {
            delete this.mines.markers[key];
        } else {
            this.mines.markers[key] = { username, avatar };
        }

        await this.saveMines();
        return true;
    },

    getScore: function (username) {
        return this.mines.scores[username] || 0;
    }
}; 