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

    setSpawnLocation: async function (x, y) {
        try {
            GameState.currentUser.x = x;
            GameState.currentUser.y = y;

            // Ensure we have all required data before proceeding
            if (!GameState.currentUser.username ||
                !GameState.currentUser.avatar ||
                !GameState.currentUser.color ||
                x === null ||
                y === null) {
                throw new Error('Missing required player data');
            }

            // Wait for player data to be saved before proceeding
            await GameState.finalizePlayer(x, y);
            await App.showScreen(App.screens.PLAY);
        } catch (error) {
            console.error('Failed to set spawn location:', error);
            alert('Failed to set spawn location. Please try again.');
        }
    },

    // Find an empty cell around a position
    findEmptySpawnPosition: async function (targetX, targetY) {
        const adjacentCells = [
            { x: -1, y: -1 }, { x: 0, y: -1 }, { x: 1, y: -1 },
            { x: -1, y: 0 }, { x: 1, y: 0 },
            { x: -1, y: 1 }, { x: 0, y: 1 }, { x: 1, y: 1 }
        ];

        // Get all players
        const onlinePlayers = await MockDB.getOnlinePlayers();
        const occupiedPositions = onlinePlayers.map(p => `${p.position.x},${p.position.y}`);

        // Try each adjacent cell
        for (const offset of adjacentCells) {
            const newX = targetX + offset.x;
            const newY = targetY + offset.y;

            // Check if this position is occupied
            if (!occupiedPositions.includes(`${newX},${newY}`)) {
                return { x: newX, y: newY };
            }
        }

        // If all adjacent cells are occupied, try cells one step further out
        const extendedCells = [
            { x: -2, y: -2 }, { x: -1, y: -2 }, { x: 0, y: -2 }, { x: 1, y: -2 }, { x: 2, y: -2 },
            { x: -2, y: -1 }, { x: 2, y: -1 },
            { x: -2, y: 0 }, { x: 2, y: 0 },
            { x: -2, y: 1 }, { x: 2, y: 1 },
            { x: -2, y: 2 }, { x: -1, y: 2 }, { x: 0, y: 2 }, { x: 1, y: 2 }, { x: 2, y: 2 }
        ];

        for (const offset of extendedCells) {
            const newX = targetX + offset.x;
            const newY = targetY + offset.y;

            if (!occupiedPositions.includes(`${newX},${newY}`)) {
                return { x: newX, y: newY };
            }
        }

        // If still no empty cell found, return a random position nearby
        return {
            x: targetX + Math.floor(Math.random() * 5) - 2,
            y: targetY + Math.floor(Math.random() * 5) - 2
        };
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
            const x = Math.floor(Math.random() * 201) - 100; // -100 to 100
            const y = Math.floor(Math.random() * 201) - 100;
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