const SpawnScreen = {
    show: function (container) {
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
                    <div class="spawn-option random-spawn">
                        <h3>Random Location</h3>
                        <button class="spawn-button" data-spawn="random">Spawn Randomly</button>
                    </div>
                    <div class="spawn-option custom-spawn">
                        <h3>Custom Location</h3>
                        <div class="coordinate-inputs">
                            <input type="number" id="spawn-x" placeholder="X coordinate" min="0" value="0">
                            <input type="number" id="spawn-y" placeholder="Y coordinate" min="0" value="0">
                            <button class="spawn-button" data-spawn="custom">Spawn Here</button>
                        </div>
                    </div>
                    <div class="spawn-option near-player">
                        <h3>Near Other Players</h3>
                        <div class="player-list">
                            ${this.createPlayerList()}
                        </div>
                    </div>
                </div>
            </div>
        `;
        container.innerHTML = html;

        // Update player list when we get updates from server
        if (GameState.connection instanceof WebSocketGameConnection) {
            const updatePlayerList = async () => {
                const playerList = container.querySelector('.player-list');
                if (playerList) {
                    playerList.innerHTML = await this.createPlayerList();
                }
            };

            GameState.on('playersUpdated', updatePlayerList);

            // Clean up when screen changes
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (!document.contains(container)) {
                        GameState.off('playersUpdated', updatePlayerList);
                        observer.disconnect();
                    }
                });
            });
            observer.observe(document.body, { childList: true, subtree: true });
        }

        this.attachEventListeners(container);
    },

    createPlayerList: async function () {
        const onlinePlayers = [];
        const now = Date.now();
        const timeLimit = now - (60 * 1000); // Players active in last minute

        // Filter and format player data
        for (const [userId, userData] of GameState.players.entries()) {
            if (userData.lastActive > timeLimit && userData.userId !== GameState.currentUser.userId) {
                onlinePlayers.push({
                    username: userData.name,
                    avatar: userData.avatar,
                    color: userData.color,
                    position: {
                        x: userData.view?.x1 || 0,
                        y: userData.view?.y1 || 0
                    }
                });
            }
        }

        if (onlinePlayers.length === 0) {
            return '<div class="no-players">No other players online</div>';
        }

        return onlinePlayers.map(player => `
            <div class="player-option" data-x="${player.position.x}" data-y="${player.position.y}">
                <span class="player-avatar" style="color: ${player.color}">${player.avatar}</span>
                <span class="player-name">${player.username}</span>
                <span class="player-coords">(${player.position.x}, ${player.position.y})</span>
            </div>
        `).join('');
    },

    // Validate and clamp coordinates to grid bounds
    validateCoordinates: function (x, y) {
        const gridInfo = GameState.connection.getGridInfo();
        if (!gridInfo) {
            throw new Error("Grid information not available");
        }

        const gridWidth = gridInfo.width;
        const gridHeight = gridInfo.height;
        const gridCenterX = Math.floor(gridWidth / 2);
        const gridCenterY = Math.floor(gridHeight / 2);

        return {
            x: Math.max(-gridCenterX, Math.min(gridCenterX, x)),
            y: Math.max(-gridCenterY, Math.min(gridCenterY, y))
        };
    },

    setSpawnLocation: async function (x, y) {
        try {
            // Validate and clamp coordinates
            const validPos = this.validateCoordinates(x, y);

            const isServerMode = GameState.connection instanceof WebSocketGameConnection;
            if (isServerMode) {
                if (!GameState.currentUser.userId) {
                    // Register with server first
                    const userData = await GameState.connection.registerPlayer(GameState.currentUser.username);
                    GameState.updateFromServer(userData);
                }

                // Send initial view centered on spawn position
                const viewSize = 20; // View radius
                GameState.connection.ws.send(`view ${validPos.x - viewSize} ${validPos.y - viewSize} ${validPos.x + viewSize} ${validPos.y + viewSize} 1`);
            } else {
                // Local mode
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

                await GameState.finalizePlayer(validPos.x, validPos.y);
            }

            // Always send a view update before showing play screen
            const viewSize = 20; // View radius
            if (isServerMode) {
                GameState.connection.ws.send(`view ${validPos.x - viewSize} ${validPos.y - viewSize} ${validPos.x + viewSize} ${validPos.y + viewSize} 1`);
            }
            await App.showScreen(App.screens.PLAY);
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
        const onlinePlayers = [];
        for (const [userId, userData] of GameState.players.entries()) {
            if (userData.view) {
                onlinePlayers.push({
                    position: {
                        x: userData.view.x1,
                        y: userData.view.y1
                    }
                });
            }
        }

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

    attachEventListeners: function (container) {
        // Back button
        document.querySelector('.back-button').addEventListener('click', () => {
            App.showScreen(App.screens.CUSTOMIZE);
        });

        // Random spawn
        const randomSpawnBtn = document.querySelector('.spawn-button[data-spawn="random"]');
        if (randomSpawnBtn) {
            randomSpawnBtn.addEventListener('click', () => {
                const gridInfo = GameState.connection.getGridInfo();
                if (!gridInfo) {
                    alert('Grid information not available. Please try again.');
                    return;
                }

                const gridCenterX = Math.floor(gridInfo.width / 2);
                const gridCenterY = Math.floor(gridInfo.height / 2);
                const x = Math.floor(Math.random() * gridInfo.width) - gridCenterX;
                const y = Math.floor(Math.random() * gridInfo.height) - gridCenterY;
                this.setSpawnLocation(x, y);
            });
        }

        // Custom coordinate spawn
        const customSpawnBtn = document.querySelector('.spawn-button[data-spawn="custom"]');
        if (customSpawnBtn) {
            customSpawnBtn.addEventListener('click', () => {
                const xInput = document.getElementById('spawn-x');
                const yInput = document.getElementById('spawn-y');
                const x = parseInt(xInput.value);
                const y = parseInt(yInput.value);

                if (isNaN(x) || isNaN(y)) {
                    alert('Please enter valid X and Y coordinates');
                    return;
                }

                this.setSpawnLocation(x, y);
            });
        }

        // Player spawn
        const playerList = container.querySelector('.player-list');
        if (playerList) {
            playerList.addEventListener('click', async (e) => {
                const playerOption = e.target.closest('.player-option');
                if (!playerOption) return;

                const targetX = parseInt(playerOption.dataset.x);
                const targetY = parseInt(playerOption.dataset.y);

                // Find an empty position near the target player
                const spawnPos = await this.findEmptySpawnPosition(targetX, targetY);
                this.setSpawnLocation(spawnPos.x, spawnPos.y);
            });
        }
    }
}; 