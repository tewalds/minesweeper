const SpawnScreen = {
    show: function (container) {
        const gridInfo = GameState.connection.getGridInfo();
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
                            <input type="number" id="spawn-x" placeholder="X coordinate" min="0" max="${gridInfo.width}" value="${GameState.currentUser().mouse.x}">
                            <input type="number" id="spawn-y" placeholder="Y coordinate" min="0" max="${gridInfo.height}" value="${GameState.currentUser().mouse.y}">
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
        const timeLimit = Date.now() - (60 * 1000); // Players active in last minute

        // Filter and format player data
        for (const [userId, user] of GameState.players.entries()) {
            if (user.lastActive > timeLimit && user.userId !== GameState.userid) {
                onlinePlayers.push(user);
            }
        }

        if (onlinePlayers.length === 0) {
            return '<div class="no-players">No other players online</div>';
        }

        return onlinePlayers.map(player => `
            <div class="player-option" data-x="${player.mouse.x}" data-y="${player.mouse.y}">
                <span class="player-avatar" style="color: ${player.color}">${player.avatar}</span>
                <span class="player-name">${player.name}</span>
                <span class="player-coords">(${player.mouse.x}, ${player.mouse.y})</span>
            </div>
        `).join('');
    },

    // Validate and clamp coordinates to grid bounds
    validateCoordinates: function (x, y) {
        const gridInfo = GameState.connection.getGridInfo();
        return {
            x: Math.max(0, Math.min(gridInfo.width, x)),
            y: Math.max(0, Math.min(gridInfo.height, y))
        };
    },

    setSpawnLocation: async function (x, y) {
        try {
            // Validate and clamp coordinates
            const validPos = this.validateCoordinates(x, y);

            // Send initial view centered on spawn position
            const viewSize = 20; // View radius. TODO: Configure based on zoom/resolution.
            GameState.connection.sendView(
                validPos.x - viewSize, validPos.y - viewSize, validPos.x + viewSize, validPos.y + viewSize, true);

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
                const x = Math.floor(Math.random() * gridInfo.width);
                const y = Math.floor(Math.random() * gridInfo.height);
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