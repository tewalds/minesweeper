const SpawnScreen = {
    show: async function (container) {
        const savedPlayer = await MockDB.getPlayer(GameState.currentUser.username);

        const html = `
            <div class="spawn-screen">
                <div class="screen-header">
                    <button class="header-button back-button">← Back</button>
                    <h2>Choose Spawn Location</h2>
                    <button class="header-button settings-toggle">⚙️ Menu</button>
                    <div class="settings-dropdown hidden">
                        <button class="logout-button">Logout</button>
                    </div>
                </div>
                <div class="spawn-options">
                    ${savedPlayer ? `
                    <div class="spawn-method">
                        <h3>Last Position</h3>
                        <button id="last-position">Return to (${savedPlayer.position.x}, ${savedPlayer.position.y})</button>
                    </div>
                    ` : ''}
                    <div class="spawn-method">
                        <button id="random-spawn">Random Location</button>
                    </div>
                    
                    <div class="spawn-method">
                        <h3>Specific Coordinates</h3>
                        <div class="coordinate-inputs">
                            <input type="number" id="spawn-x" placeholder="X coordinate" value="0">
                            <input type="number" id="spawn-y" placeholder="Y coordinate" value="0">
                            <button id="coordinate-spawn">Spawn Here</button>
                        </div>
                    </div>

                    <div class="spawn-method">
                        <h3>Spawn Near Player</h3>
                        <div class="online-players">
                            ${await this.createPlayerList()}
                        </div>
                    </div>
                </div>
            </div>
        `;
        container.innerHTML = html;
        this.attachEventListeners();
    },

    createPlayerList: async function () {
        const onlinePlayers = await MockDB.getOnlinePlayers();
        // Filter out current user from the list
        const otherPlayers = onlinePlayers.filter(p => p.username !== GameState.currentUser.username);

        return otherPlayers.map(player => `
            <div class="player-option" data-x="${player.position.x}" data-y="${player.position.y}">
                <span class="player-avatar" style="color: ${player.color}">${player.avatar}</span>
                <span class="player-name">${player.username}</span>
                <span class="player-coords">(${player.position.x}, ${player.position.y})</span>
            </div>
        `).join('');
    },

    // Validate and clamp coordinates to grid bounds
    validateCoordinates: function (x, y) {
        const gridCenterX = Math.floor(MinesweeperDB.gridWidth / 2);
        const gridCenterY = Math.floor(MinesweeperDB.gridHeight / 2);

        return {
            x: Math.max(-gridCenterX, Math.min(gridCenterX, x)),
            y: Math.max(-gridCenterY, Math.min(gridCenterY, y))
        };
    },

    setSpawnLocation: async function (x, y) {
        try {
            // Validate and clamp coordinates
            const validPos = this.validateCoordinates(x, y);
            GameState.currentUser.x = validPos.x;
            GameState.currentUser.y = validPos.y;

            // Ensure we have all required data before proceeding
            if (!GameState.currentUser.username ||
                !GameState.currentUser.avatar ||
                !GameState.currentUser.color ||
                validPos.x === null ||
                validPos.y === null) {
                throw new Error('Missing required player data');
            }

            const isServerMode = GameState.connection instanceof WebSocketGameConnection;
            if (isServerMode) {
                // In server mode, just register and go straight to play
                await GameState.connection.registerPlayer(GameState.currentUser.username);
                await App.showScreen(App.screens.PLAY);
            } else {
                // In local mode, save player data and proceed
                await GameState.finalizePlayer(validPos.x, validPos.y);
                await App.showScreen(App.screens.PLAY);
            }
        } catch (error) {
            console.error('Failed to set spawn location:', error);
            alert('Failed to set spawn location. Please try again.');
        }
    },

    // Find an empty cell around a position
    findEmptySpawnPosition: async function (targetX, targetY) {
        // Validate target coordinates first
        const validTarget = this.validateCoordinates(targetX, targetY);
        targetX = validTarget.x;
        targetY = validTarget.y;

        // Get all players
        const onlinePlayers = await MockDB.getOnlinePlayers();
        const occupiedPositions = new Set(onlinePlayers.map(p => `${p.position.x},${p.position.y}`));

        // First try immediate adjacent positions (distance 1)
        const adjacentOffsets = [
            { x: 0, y: -1 },  // North
            { x: 1, y: -1 },  // Northeast
            { x: 1, y: 0 },   // East
            { x: 1, y: 1 },   // Southeast
            { x: 0, y: 1 },   // South
            { x: -1, y: 1 },  // Southwest
            { x: -1, y: 0 },  // West
            { x: -1, y: -1 }  // Northwest
        ];

        // Check immediate adjacent positions first
        for (const offset of adjacentOffsets) {
            const newX = targetX + offset.x;
            const newY = targetY + offset.y;
            const validPos = this.validateCoordinates(newX, newY);
            const key = `${validPos.x},${validPos.y}`;

            if (!occupiedPositions.has(key)) {
                return validPos;
            }
        }

        // If no immediate spots, try increasingly larger rings
        const maxRings = 5; // Look up to 5 cells out
        for (let ring = 2; ring <= maxRings; ring++) {
            const positions = [];

            // Generate all positions in this ring
            for (let dx = -ring; dx <= ring; dx++) {
                for (let dy = -ring; dy <= ring; dy++) {
                    // Only consider positions on the ring perimeter
                    if (Math.abs(dx) === ring || Math.abs(dy) === ring) {
                        const newX = targetX + dx;
                        const newY = targetY + dy;

                        // Validate position is within grid bounds
                        const validPos = this.validateCoordinates(newX, newY);
                        const key = `${validPos.x},${validPos.y}`;

                        if (!occupiedPositions.has(key)) {
                            // Calculate Manhattan distance to target
                            const distance = Math.abs(validPos.x - targetX) + Math.abs(validPos.y - targetY);
                            positions.push({ pos: validPos, distance });
                        }
                    }
                }
            }

            // If we found valid positions, return the closest one
            // If multiple positions have the same distance, choose randomly among them
            if (positions.length > 0) {
                // Sort by distance
                positions.sort((a, b) => a.distance - b.distance);
                const minDistance = positions[0].distance;
                const closestPositions = positions.filter(p => p.distance === minDistance);
                const chosen = closestPositions[Math.floor(Math.random() * closestPositions.length)];
                return chosen.pos;
            }
        }

        // If still no position found, find closest valid position
        const searchRadius = 10; // Expand search to 10 cells in each direction
        const candidates = [];

        for (let dx = -searchRadius; dx <= searchRadius; dx++) {
            for (let dy = -searchRadius; dy <= searchRadius; dy++) {
                const newX = targetX + dx;
                const newY = targetY + dy;
                const validPos = this.validateCoordinates(newX, newY);
                const key = `${validPos.x},${validPos.y}`;

                if (!occupiedPositions.has(key)) {
                    const distance = Math.abs(dx) + Math.abs(dy); // Manhattan distance
                    candidates.push({ pos: validPos, distance });
                }
            }
        }

        if (candidates.length > 0) {
            // Sort by distance and get the closest position
            candidates.sort((a, b) => a.distance - b.distance);
            return candidates[0].pos;
        }

        // Absolute fallback: return a position one cell away from target
        return this.validateCoordinates(targetX + 1, targetY + 1);
    },

    attachEventListeners: function () {
        // Back button
        document.querySelector('.back-button').addEventListener('click', () => {
            App.showScreen(App.screens.CUSTOMIZE);
        });

        // Last position spawn
        const lastPositionBtn = document.getElementById('last-position');
        if (lastPositionBtn) {
            lastPositionBtn.addEventListener('click', async () => {
                const savedPlayer = await MockDB.getPlayer(GameState.currentUser.username);
                if (savedPlayer) {
                    this.setSpawnLocation(savedPlayer.position.x, savedPlayer.position.y);
                }
            });
        }

        // Random spawn
        document.getElementById('random-spawn').addEventListener('click', () => {
            const gridCenterX = Math.floor(MinesweeperDB.gridWidth / 2);
            const gridCenterY = Math.floor(MinesweeperDB.gridHeight / 2);
            const x = Math.floor(Math.random() * MinesweeperDB.gridWidth) - gridCenterX;
            const y = Math.floor(Math.random() * MinesweeperDB.gridHeight) - gridCenterY;
            this.setSpawnLocation(x, y);
        });

        // Coordinate spawn
        document.getElementById('coordinate-spawn').addEventListener('click', () => {
            const x = parseInt(document.getElementById('spawn-x').value);
            const y = parseInt(document.getElementById('spawn-y').value);

            if (isNaN(x) || isNaN(y)) {
                alert('Please enter valid coordinates');
                return;
            }
            this.setSpawnLocation(x, y);
        });

        // Player spawn
        document.querySelector('.online-players').addEventListener('click', async (e) => {
            const playerOption = e.target.closest('.player-option');
            if (!playerOption) return;

            const targetX = parseInt(playerOption.dataset.x);
            const targetY = parseInt(playerOption.dataset.y);

            // Find an empty position near the target player
            const spawnPos = await this.findEmptySpawnPosition(targetX, targetY);
            this.setSpawnLocation(spawnPos.x, spawnPos.y);
        });
    }
}; 