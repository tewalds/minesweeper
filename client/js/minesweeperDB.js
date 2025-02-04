const MinesweeperDB = {
    mines: null,
    fileHandle: null,
    minePositionMap: null,
    gridWidth: 1000,
    gridHeight: 1000,
    isWriting: false, // Track if we're currently writing
    writeQueue: [], // Queue pending writes

    // Initialize with 15% mines
    generateMines: function (gridWidth, gridHeight) {
        const totalCells = gridWidth * gridHeight;
        const mineCount = Math.floor(totalCells * 0.15);
        const positions = new Array(mineCount);
        const positionMap = new Set();

        let i = 0;
        while (i < mineCount) {
            const x = Math.floor(Math.random() * gridWidth);
            const y = Math.floor(Math.random() * gridHeight);
            const pos = `${x},${y}`;

            if (!positionMap.has(pos)) {
                positions[i] = { x, y };
                positionMap.add(pos);
                i++;
            }
        }

        this.minePositionMap = positionMap;
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

    // Create efficient data structures
    createEmptyState: function () {
        return {
            positions: this.generateMines(this.gridWidth, this.gridHeight),
            revealed: new Set(), // Use Set for O(1) lookups
            markers: new Map(), // Use Map for O(1) lookups and better memory
            scores: { ...this.defaultScores }
        };
    },

    // Process queued writes one at a time
    processWriteQueue: async function () {
        if (this.isWriting || this.writeQueue.length === 0) return;

        this.isWriting = true;
        try {
            const data = this.writeQueue.shift();
            const writable = await this.fileHandle.createWritable();
            await writable.write(JSON.stringify(data, null, 4));
            await writable.close();

            // Process next write if any
            this.isWriting = false;
            if (this.writeQueue.length > 0) {
                await this.processWriteQueue();
            }
        } catch (error) {
            console.error('Error processing write queue:', error);
            this.isWriting = false;
            // Clear queue on error to prevent bad state
            this.writeQueue = [];
        }
    },

    // Queue a write operation
    queueWrite: async function (data) {
        this.writeQueue.push(data);
        await this.processWriteQueue();
    },

    // Load mines data with retries
    loadMines: async function () {
        const maxRetries = 3;
        let lastError = null;

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                if (!this.fileHandle) {
                    throw new Error('No file handle provided');
                }

                // Wait for any pending writes to complete
                while (this.isWriting || this.writeQueue.length > 0) {
                    await new Promise(resolve => setTimeout(resolve, 50));
                }

                const file = await this.fileHandle.getFile();
                const contents = await file.text();

                if (!contents.trim()) {
                    this.mines = this.createEmptyState();
                    await this.saveMines();
                } else {
                    try {
                        const data = JSON.parse(contents);
                        if (!data.mines) {
                            this.mines = this.createEmptyState();
                            await this.saveMines();
                        } else {
                            // Convert loaded data to efficient structures
                            this.mines = {
                                positions: data.mines.positions,
                                revealed: new Set(Object.keys(data.mines.revealed)),
                                markers: new Map(Object.entries(data.mines.markers)),
                                scores: data.mines.scores || this.defaultScores
                            };
                            // Rebuild mine position map
                            this.minePositionMap = new Set(this.mines.positions.map(p => `${p.x},${p.y}`));
                        }
                    } catch (e) {
                        console.error('Invalid JSON, initializing with new mines');
                        this.mines = this.createEmptyState();
                        await this.saveMines();
                    }
                }
                return; // Success, exit retry loop
            } catch (error) {
                console.warn(`Load attempt ${attempt + 1} failed:`, error);
                lastError = error;
                // Wait before retry
                await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, attempt)));
            }
        }

        // If we get here, all retries failed
        console.error('All load attempts failed:', lastError);
        if (!this.mines) {
            this.mines = this.createEmptyState();
        }
        throw lastError;
    },

    // Save mines to file - convert Sets/Maps to JSON-friendly format
    saveMines: async function () {
        try {
            if (!this.fileHandle) {
                throw new Error('No file handle provided');
            }

            // Convert to JSON-friendly format
            const saveData = {
                mines: {
                    positions: this.mines.positions,
                    revealed: Object.fromEntries([...this.mines.revealed].map(key => [key, true])),
                    markers: Object.fromEntries(this.mines.markers),
                    scores: this.mines.scores
                }
            };

            await this.queueWrite(saveData);
        } catch (error) {
            console.error('Error saving mines:', error);
            throw error; // Rethrow to handle in calling code
        }
    },

    // Initialize the DB
    init: async function () {
        await this.loadMines();
        if (!this.mines) {
            this.mines = this.createEmptyState();
            await this.saveMines();
        }
    },

    // Regenerate the grid
    regenerateGrid: async function () {
        this.mines = {
            positions: this.generateMines(this.gridWidth, this.gridHeight),
            revealed: new Set(),
            markers: new Map(),
            scores: this.mines ? this.mines.scores : this.defaultScores // Preserve existing scores
        };
        await this.saveMines();
    },

    // Game methods
    isValidPosition: function (x, y) {
        return x >= 0 && x < this.gridWidth && y >= 0 && y < this.gridHeight;
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

    revealCell: async function (x, y, username) {
        if (!this.isValidPosition(x, y)) return false;

        const key = `${x},${y}`;
        if (this.mines.revealed.has(key)) return false;

        // Track all cells to reveal
        const cellsToReveal = new Set();
        const queue = [[x, y]];

        while (queue.length > 0) {
            const [currX, currY] = queue.shift();
            const currKey = `${currX},${currY}`;

            if (cellsToReveal.has(currKey)) continue;

            cellsToReveal.add(currKey);

            if (!this.isMine(currX, currY) && this.getAdjacentMines(currX, currY) === 0) {
                for (let dx = -1; dx <= 1; dx++) {
                    for (let dy = -1; dy <= 1; dy++) {
                        if (dx === 0 && dy === 0) continue;
                        const newX = currX + dx;
                        const newY = currY + dy;
                        const newKey = `${newX},${newY}`;
                        if (this.isValidPosition(newX, newY) && !this.mines.revealed.has(newKey) && !cellsToReveal.has(newKey)) {
                            queue.push([newX, newY]);
                        }
                    }
                }
            }
        }

        // Apply all reveals at once
        let scoreIncrement = 0;
        for (const cellKey of cellsToReveal) {
            this.mines.revealed.add(cellKey);
            if (!this.isMine(...cellKey.split(',').map(Number))) {
                scoreIncrement++;
            }
        }

        if (this.isMine(x, y)) {
            this.mines.scores[username] = 0;
        } else {
            this.mines.scores[username] = (this.mines.scores[username] || 0) + scoreIncrement;
        }

        await this.saveMines();
        return true;
    },

    toggleMarker: async function (x, y, username, avatar) {
        if (!this.isValidPosition(x, y)) return false;

        const key = `${x},${y}`;
        if (this.mines.revealed.has(key)) return false;

        const existingMarker = this.mines.markers.get(key);
        if (existingMarker?.username === username) {
            this.mines.markers.delete(key);
        } else {
            await this.setMarker(x, y, username, avatar);
        }

        await this.saveMines();
        return true;
    },

    setMarker: async function (x, y, username, avatar) {
        if (!this.isValidPosition(x, y)) return false;

        const key = `${x},${y}`;
        if (this.mines.revealed.has(key)) return false;

        this.mines.markers.set(key, { username, avatar });
        await this.saveMines();
        return true;
    },

    getScore: function (username) {
        return this.mines.scores[username] || 0;
    }
}; 