const PlayScreen = {
    GRID_SIZE: 30, // 30x30 grid
    CELL_SIZE: 25, // pixels
    UPDATE_INTERVAL: 2000, // 2 seconds
    MIN_ZOOM: 0.2,
    MAX_ZOOM: 2,
    ZOOM_SPEED: 0.1,
    updateInterval: null,
    isDragging: false,
    lastX: 0,
    lastY: 0,
    offsetX: 0,
    offsetY: 0,
    zoom: 1,

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
                </div>
                <div class="settings-menu">
                    <button class="header-button settings-toggle">⚙️ Menu</button>
                    <div class="settings-dropdown hidden">
                        <button class="logout-button">Logout</button>
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

        // Center the grid initially
        this.centerGrid();

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

    centerGrid: function () {
        const gameContainer = document.querySelector('.game-container');
        const grid = document.querySelector('.game-grid');
        if (gameContainer && grid) {
            const gridWidth = this.GRID_SIZE * this.CELL_SIZE;
            const gridHeight = this.GRID_SIZE * this.CELL_SIZE;

            // Calculate the center position
            this.offsetX = (gameContainer.clientWidth - gridWidth * this.zoom) / 2;
            this.offsetY = (gameContainer.clientHeight - gridHeight * this.zoom) / 2;

            this.updateGridTransform();
        }
    },

    updateGridTransform: function () {
        const grid = document.querySelector('.game-grid');
        if (grid) {
            grid.style.transform = `translate(${this.offsetX}px, ${this.offsetY}px) scale(${this.zoom})`;
        }
    },

    attachGameHandlers: function () {
        const container = document.querySelector('.game-container');
        const grid = document.querySelector('.game-grid');

        if (!container || !grid) return;

        // Mouse drag handling
        container.addEventListener('mousedown', (e) => {
            if (e.button === 0) { // Left click only
                this.isDragging = true;
                this.lastX = e.clientX;
                this.lastY = e.clientY;
                container.classList.add('grabbing');
            }
        });

        window.addEventListener('mousemove', (e) => {
            if (this.isDragging) {
                const deltaX = e.clientX - this.lastX;
                const deltaY = e.clientY - this.lastY;
                this.offsetX += deltaX;
                this.offsetY += deltaY;
                this.lastX = e.clientX;
                this.lastY = e.clientY;
                this.updateGridTransform();
            }
        });

        window.addEventListener('mouseup', () => {
            this.isDragging = false;
            container.classList.remove('grabbing');
        });

        // Zoom handling
        container.addEventListener('wheel', (e) => {
            e.preventDefault();
            const delta = -Math.sign(e.deltaY) * this.ZOOM_SPEED;
            const newZoom = Math.max(this.MIN_ZOOM, Math.min(this.MAX_ZOOM, this.zoom + delta));

            if (newZoom !== this.zoom) {
                // Get container dimensions
                const rect = container.getBoundingClientRect();

                // Get mouse position relative to container
                const mouseX = e.clientX - rect.left;
                const mouseY = e.clientY - rect.top;

                // Calculate the point on the grid where we're zooming
                const gridX = (mouseX - this.offsetX) / this.zoom;
                const gridY = (mouseY - this.offsetY) / this.zoom;

                // Calculate new offsets to keep the point under the mouse
                this.offsetX = mouseX - gridX * newZoom;
                this.offsetY = mouseY - gridY * newZoom;

                // Update zoom level
                this.zoom = newZoom;

                // If we're at minimum zoom, recenter the grid
                if (this.zoom === this.MIN_ZOOM) {
                    this.centerGrid();
                } else {
                    this.updateGridTransform();
                }
            }
        });

        // Keyboard movement
        window.addEventListener('keydown', (e) => {
            const moveSpeed = 20;
            switch (e.key.toLowerCase()) {
                case 'w':
                case 'arrowup':
                    this.offsetY += moveSpeed;
                    break;
                case 's':
                case 'arrowdown':
                    this.offsetY -= moveSpeed;
                    break;
                case 'a':
                case 'arrowleft':
                    this.offsetX += moveSpeed;
                    break;
                case 'd':
                case 'arrowright':
                    this.offsetX -= moveSpeed;
                    break;
            }
            this.updateGridTransform();
        });

        // Cell click handling
        grid.addEventListener('click', async (e) => {
            const cell = e.target.closest('.grid-cell');
            if (!cell) return;

            const x = parseInt(cell.dataset.x);
            const y = parseInt(cell.dataset.y);
            await MinesweeperDB.revealCell(x, y, GameState.currentUser.username);
            await this.renderMinesweeperState();
        });

        grid.addEventListener('contextmenu', async (e) => {
            e.preventDefault();
            const cell = e.target.closest('.grid-cell');
            if (!cell) return;

            const x = parseInt(cell.dataset.x);
            const y = parseInt(cell.dataset.y);
            await MinesweeperDB.toggleMarker(x, y, GameState.currentUser.username, GameState.currentUser.avatar);
            await this.renderMinesweeperState();
        });
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