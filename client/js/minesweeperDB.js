const MinesweeperDB = {
    mines: null,
    fileHandle: null,
    minePositionMap: null, // For O(1) mine lookup

    // Initialize with 15% mines
    generateMines: function (gridWidth, gridHeight) {
        const totalCells = gridWidth * gridHeight;
        const mineCount = Math.floor(totalCells * 0.15);
        const positions = [];
        const positionMap = new Set(); // Track taken positions

        while (positions.length < mineCount) {
            const x = Math.floor(Math.random() * gridWidth);
            const y = Math.floor(Math.random() * gridHeight);
            const pos = `${x},${y}`;

            // Check if position is already taken using Set
            if (!positionMap.has(pos)) {
                positions.push({ x, y });
                positionMap.add(pos);
            }
        }

        // Create mine position map
        this.minePositionMap = new Set(positions.map(p => `${p.x},${p.y}`));
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
                    positions: this.generateMines(80, 40),
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
                        positions: this.generateMines(80, 40),
                        revealed: {},
                        markers: {},
                        scores: this.defaultScores
                    };
                    await this.saveMines();
                } else {
                    const data = JSON.parse(contents);
                    if (!data.mines) {
                        this.mines = {
                            positions: this.generateMines(80, 40),
                            revealed: {},
                            markers: {},
                            scores: this.defaultScores
                        };
                        await this.saveMines();
                    } else {
                        this.mines = data.mines;
                        // Rebuild mine position map
                        this.minePositionMap = new Set(this.mines.positions.map(p => `${p.x},${p.y}`));
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
                    positions: this.generateMines(80, 40),
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
                    positions: this.generateMines(80, 40),
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
                positions: this.generateMines(80, 40),
                revealed: {},
                markers: {},
                scores: this.defaultScores
            };
            await this.saveMines();
        }
    },

    // Regenerate the grid
    regenerateGrid: async function () {
        this.mines = {
            positions: this.generateMines(80, 40),
            revealed: {},
            markers: {},
            scores: this.mines ? this.mines.scores : this.defaultScores // Preserve existing scores
        };
        await this.saveMines();
    },

    // Game methods
    isValidPosition: function (x, y) {
        return x >= 0 && x < 80 && y >= 0 && y < 40;
    },

    isMine: function (x, y) {
        return this.minePositionMap.has(`${x},${y}`);
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

    // Optimized reveal using queue-based flood fill
    revealCell: async function (x, y, username) {
        if (!this.isValidPosition(x, y)) return false;

        const key = `${x},${y}`;
        if (this.mines.revealed[key]) return false;

        // Track all cells to reveal
        const cellsToReveal = new Set();
        const queue = [[x, y]];

        // Flood fill to find all cells to reveal
        while (queue.length > 0) {
            const [currX, currY] = queue.shift();
            const currKey = `${currX},${currY}`;

            // Skip if already processed
            if (cellsToReveal.has(currKey)) continue;

            // Add to reveal set
            cellsToReveal.add(currKey);

            // If it's an empty cell, add neighbors to queue
            if (!this.isMine(currX, currY) && this.getAdjacentMines(currX, currY) === 0) {
                for (let dx = -1; dx <= 1; dx++) {
                    for (let dy = -1; dy <= 1; dy++) {
                        if (dx === 0 && dy === 0) continue;
                        const newX = currX + dx;
                        const newY = currY + dy;
                        const newKey = `${newX},${newY}`;
                        if (this.isValidPosition(newX, newY) && !this.mines.revealed[newKey] && !cellsToReveal.has(newKey)) {
                            queue.push([newX, newY]);
                        }
                    }
                }
            }
        }

        // Apply all reveals at once
        let scoreIncrement = 0;
        for (const cellKey of cellsToReveal) {
            this.mines.revealed[cellKey] = true;
            // Only increment score for non-mine cells
            if (!this.isMine(...cellKey.split(',').map(Number))) {
                scoreIncrement++;
            }
        }

        // Update score
        if (this.isMine(x, y)) {
            this.mines.scores[username] = 0;
        } else {
            this.mines.scores[username] = (this.mines.scores[username] || 0) + scoreIncrement;
        }

        // Save only once after all reveals
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