const PlayScreen = {
    GRID_SIZE: 30, // 30x30 grid
    CELL_SIZE: 25, // pixels
    UPDATE_INTERVAL: 2000, // 2 seconds
    updateInterval: null,

    show: async function (container) {
        const html = `
            <div class="play-screen">
                <div class="player-info-container">
                    <div class="player-info">
                        <span class="player-avatar" style="color: ${GameState.currentUser.color}">
                            ${GameState.currentUser.avatar}
                        </span>
                        <span class="player-name">${GameState.currentUser.username}</span>
                        <span class="player-coords">(${GameState.currentUser.x}, ${GameState.currentUser.y})</span>
                        <span class="player-score">Score: ${MinesweeperDB.getScore(GameState.currentUser.username)}</span>
                    </div>
                    <div class="settings-menu">
                        <button class="header-button settings-toggle">⚙️ Menu</button>
                        <div class="settings-dropdown hidden">
                            <button class="logout-button">Logout</button>
                        </div>
                    </div>
                </div>
                <div class="game-container">
                    <div class="player-indicators"></div>
                    <div class="game-grid" style="
                        width: ${this.GRID_SIZE * this.CELL_SIZE}px; 
                        height: ${this.GRID_SIZE * this.CELL_SIZE}px;
                    ">
                        ${this.createGrid()}
                    </div>
                </div>
            </div>
        `;
        container.innerHTML = html;
        await this.renderPlayers();
        await this.renderMinesweeperState();
        this.attachGameHandlers();
        this.startUpdates();
    },

    createGrid: function () {
        let grid = '';
        for (let y = 0; y < this.GRID_SIZE; y++) {
            for (let x = 0; x < this.GRID_SIZE; x++) {
                grid += `<div class="grid-cell" data-x="${x}" data-y="${y}"></div>`;
            }
        }
        return grid;
    },

    getPlayerDirection: function (playerX, playerY) {
        const dx = playerX - GameState.currentUser.x;
        const dy = playerY - GameState.currentUser.y;
        console.log('Direction calculation:', {
            player: { x: playerX, y: playerY },
            current: { x: GameState.currentUser.x, y: GameState.currentUser.y },
            delta: { dx, dy }
        });

        // Determine the primary direction based on which delta is larger
        if (Math.abs(dx) > Math.abs(dy)) {
            return dx > 0 ? 'right' : 'left';
        } else {
            return dy > 0 ? 'bottom' : 'top';
        }
    },

    renderPlayers: async function () {
        const onlinePlayers = await MockDB.getOnlinePlayers();
        console.log('Online players:', onlinePlayers);

        const indicatorsContainer = document.querySelector('.player-indicators');
        console.log('Indicators container:', indicatorsContainer);

        // Safety check
        if (!indicatorsContainer) {
            console.error('Player indicators container not found');
            return;
        }

        indicatorsContainer.innerHTML = '';

        // Group players by direction
        const playersByDirection = {};

        onlinePlayers.forEach(player => {
            if (player.username === GameState.currentUser.username) return; // Skip current player
            console.log('Processing player:', player.username);

            const direction = this.getPlayerDirection(player.position.x, player.position.y);
            console.log('Direction for', player.username, ':', direction);

            if (!playersByDirection[direction]) {
                playersByDirection[direction] = [];
            }
            playersByDirection[direction].push(player);
        });

        console.log('Players by direction:', playersByDirection);

        // Create indicators for each direction
        Object.entries(playersByDirection).forEach(([direction, players]) => {
            const directionContainer = document.createElement('div');
            directionContainer.className = `direction-container ${direction}`;

            players.forEach(player => {
                const score = MinesweeperDB.getScore(player.username);
                const indicator = document.createElement('div');
                indicator.className = 'player-indicator';
                indicator.innerHTML = `
                    <div class="indicator-content" style="color: ${player.color}">
                        <span class="indicator-arrow">${this.getDirectionArrow(direction)}</span>
                        <span class="indicator-avatar">${player.avatar}</span>
                        <span class="indicator-name">${player.username}</span>
                        <span class="indicator-score">${score}</span>
                    </div>
                `;
                directionContainer.appendChild(indicator);
            });

            indicatorsContainer.appendChild(directionContainer);
        });
    },

    getDirectionArrow: function (direction) {
        const arrows = {
            top: '↑',
            right: '→',
            bottom: '↓',
            left: '←'
        };
        return arrows[direction];
    },

    renderMinesweeperState: async function () {
        const grid = document.querySelector('.game-grid');
        if (!grid) {
            console.error('Game grid not found');
            return;
        }

        // Safety check for mines data
        if (!MinesweeperDB.mines) {
            console.error('Mines data not loaded');
            return;
        }

        // Update all cells based on game state
        for (let y = 0; y < this.GRID_SIZE; y++) {
            for (let x = 0; x < this.GRID_SIZE; x++) {
                const cell = grid.querySelector(`.grid-cell[data-x="${x}"][data-y="${y}"]`);
                if (!cell) continue;

                const key = `${x},${y}`;

                // Check if cell is revealed
                if (MinesweeperDB.mines.revealed[key]) {
                    if (MinesweeperDB.isMine(x, y)) {
                        cell.innerHTML = '💣';
                        cell.classList.add('revealed', 'mine');
                    } else {
                        const count = MinesweeperDB.getAdjacentMines(x, y);
                        cell.innerHTML = count || '';
                        cell.classList.add('revealed', count ? `adjacent-${count}` : 'empty');
                    }
                } else {
                    // Check if cell is marked
                    const marker = MinesweeperDB.mines.markers[key];
                    if (marker) {
                        cell.innerHTML = marker.avatar;
                        cell.style.color = (await MockDB.getPlayer(marker.username))?.color || '#000';
                    } else {
                        cell.innerHTML = '';
                        cell.style.color = '';
                    }
                }
            }
        }

        // Update score
        const scoreElement = document.querySelector('.player-score');
        if (scoreElement) {
            scoreElement.textContent = `Score: ${MinesweeperDB.getScore(GameState.currentUser.username)}`;
        }
    },

    attachGameHandlers: function () {
        const grid = document.querySelector('.game-grid');
        if (!grid) return;

        const handleCellClick = async (e) => {
            const cell = e.target.closest('.grid-cell');
            if (!cell) return;

            const x = parseInt(cell.dataset.x);
            const y = parseInt(cell.dataset.y);

            if (e.button === 2) { // Right click
                e.preventDefault();
                await MinesweeperDB.toggleMarker(x, y, GameState.currentUser.username, GameState.currentUser.avatar);
            } else { // Left click
                await MinesweeperDB.revealCell(x, y, GameState.currentUser.username);
            }

            await this.renderMinesweeperState();
        };

        grid.addEventListener('click', handleCellClick);
        grid.addEventListener('contextmenu', handleCellClick);
    },

    startUpdates: function () {
        // Clear any existing interval
        this.stopUpdates();

        // Start periodic updates
        this.updateInterval = setInterval(async () => {
            try {
                await Promise.all([
                    MockDB.loadPlayers(), // Refresh player data
                    MinesweeperDB.loadMines() // Refresh mines data
                ]);
                await this.renderPlayers();
                await this.renderMinesweeperState();
            } catch (error) {
                console.error('Error during periodic update:', error);
            }
        }, this.UPDATE_INTERVAL);

        // Clean up when leaving the screen
        window.addEventListener('beforeunload', () => this.stopUpdates());
    },

    stopUpdates: function () {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
    }
}; 