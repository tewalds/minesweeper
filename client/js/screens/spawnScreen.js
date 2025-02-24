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
        if (GameState.connection) {
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
                        x: userData.mouse?.x || 0,
                        y: userData.mouse?.y || 0,
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

            // Send initial view centered on spawn position
            const viewSize = 20; // View radius. TODO: Configure based on zoom/resolution.
            GameState.connection.sendView(x - viewSize, y - viewSize, x + viewSize, y + viewSize, true);

            await App.showScreen(App.screens.PLAY);
        } catch (error) {
            console.error('Failed to set spawn location:', error);
            alert('Failed to set spawn location. Please try again.');
        }
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
                this.setSpawnLocation(targetX, targetY);
            });
        }
    }
}; 