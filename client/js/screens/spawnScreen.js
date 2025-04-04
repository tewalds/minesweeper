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

    setSpawnLocation: async function(point) {
        try {
            await App.showScreen(App.screens.PLAY, point);
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
                const x = gridInfo.left + Math.floor(Math.random() * gridInfo.width);
                const y = gridInfo.top + Math.floor(Math.random() * gridInfo.height);
                this.setSpawnLocation(new Point(x, y));
            });
        }

        // Custom coordinate spawn
        const customSpawnBtn = document.querySelector('.spawn-button[data-spawn="custom"]');
        if (customSpawnBtn) {
            customSpawnBtn.addEventListener('click', () => {
                const x = parseInt(document.getElementById('spawn-x').value);
                const y = parseInt(document.getElementById('spawn-y').value);
                if (isNaN(x) || isNaN(y)) {
                    alert('Please enter valid X and Y coordinates');
                    return;
                }
                this.setSpawnLocation(new Point(x, y));
            });
        }

        // Player spawn
        const playerList = container.querySelector('.player-list');
        if (playerList) {
            playerList.addEventListener('click', async (e) => {
                const playerOption = e.target.closest('.player-option');
                if (!playerOption) return;
                const x = parseInt(playerOption.dataset.x);
                const y = parseInt(playerOption.dataset.y);
                this.setSpawnLocation(new Point(x, y));
            });
        }
    }
}; 