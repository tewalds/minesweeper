const PlayScreen = {
    CELL_SIZE: 25, // pixels
    UPDATE_INTERVAL: 2000, // 2 seconds
    MAX_ZOOM: 2.0, // 200% maximum zoom
    MIN_ZOOM_CAP: 0.5, // Never zoom out beyond 50%
    BASE_MOVE_SPEED: 20, // Base speed for keyboard movement
    BASE_ZOOM_SPEED: 0.1, // Base speed for zooming
    EDGE_SCROLL_THRESHOLD: 20, // Pixels from edge to trigger scrolling
    EDGE_SCROLL_SPEED: 15, // Base speed for edge scrolling
    RENDER_MARGIN: 2, // Extra cells to render beyond viewport
    CELL_POOL_SIZE: 2500, // Pool of reusable cells (50x50 visible area)
    updateInterval: null,
    isDragging: false,
    lastX: 0,
    lastY: 0,
    offsetX: 0,
    offsetY: 0,
    zoom: 1,
    pressedKeys: new Set(), // Track currently pressed keys
    moveAnimationFrame: null, // Track animation frame for movement
    zoomAnimationFrame: null, // Track animation frame for zooming
    activeZoom: null, // Direction of active zoom (1 for in, -1 for out, null for none)
    cellPool: [], // Pool of reusable cell elements
    visibleCells: new Map(), // Currently visible cells
    cellUpdateQueued: false, // Prevent multiple concurrent updates

    // Calculate minimum zoom to ensure grid fills viewport
    calculateMinZoom: function (containerWidth, containerHeight) {
        const gridWidth = MinesweeperDB.gridWidth * this.CELL_SIZE;
        const gridHeight = MinesweeperDB.gridHeight * this.CELL_SIZE;

        // Calculate zoom needed to fill width and height
        const zoomWidth = containerWidth / gridWidth;
        const zoomHeight = containerHeight / gridHeight;

        // Use the larger zoom to ensure grid fills viewport in both dimensions
        // But never go below MIN_ZOOM_CAP
        return Math.max(Math.max(zoomWidth, zoomHeight), this.MIN_ZOOM_CAP);
    },

    // Clamp offset values to keep grid in bounds
    clampOffset: function (container) {
        if (!container) return;

        const gridWidth = MinesweeperDB.gridWidth * this.CELL_SIZE * this.zoom;
        const gridHeight = MinesweeperDB.gridHeight * this.CELL_SIZE * this.zoom;
        const containerWidth = container.clientWidth;
        const containerHeight = container.clientHeight;

        // If grid is smaller than container (at minimum zoom), center it
        if (gridWidth <= containerWidth) {
            this.offsetX = (containerWidth - gridWidth) / 2;
        } else {
            // Otherwise clamp to keep edges in bounds
            this.offsetX = Math.min(0, Math.max(containerWidth - gridWidth, this.offsetX));
        }

        if (gridHeight <= containerHeight) {
            this.offsetY = (containerHeight - gridHeight) / 2;
        } else {
            this.offsetY = Math.min(0, Math.max(containerHeight - gridHeight, this.offsetY));
        }
    },

    show: async function (container) {
        // Set cell size CSS variable
        document.documentElement.style.setProperty('--cell-size', `${this.CELL_SIZE}px`);

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
                        <button class="new-grid-button">🔄 New Grid</button>
                        <button class="logout-button">Logout</button>
                    </div>
                </div>
                <div class="game-container">
                    <div class="player-indicators"></div>
                    <div class="game-grid" style="
                        width: ${MinesweeperDB.gridWidth * this.CELL_SIZE}px; 
                        height: ${MinesweeperDB.gridHeight * this.CELL_SIZE}px;
                        grid-template-columns: repeat(${MinesweeperDB.gridWidth}, var(--cell-size));
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
        // No longer need to create all cells upfront
        return '';
    },

    getPlayerDirection: function (playerX, playerY) {
        const dx = playerX - GameState.currentUser.x;
        const dy = playerY - GameState.currentUser.y;

        // Determine the primary direction based on which delta is larger
        if (Math.abs(dx) > Math.abs(dy)) {
            return dx > 0 ? 'right' : 'left';
        } else {
            return dy > 0 ? 'bottom' : 'top';
        }
    },

    renderPlayers: async function () {
        const onlinePlayers = await MockDB.getOnlinePlayers();
        const indicatorsContainer = document.querySelector('.player-indicators');

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

            const direction = this.getPlayerDirection(player.position.x, player.position.y);

            if (!playersByDirection[direction]) {
                playersByDirection[direction] = [];
            }
            playersByDirection[direction].push(player);
        });

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
        const container = document.querySelector('.game-container');
        if (!grid || !container) return;

        // Update visible cells
        this.updateVisibleCells(container, grid);

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
            const gridWidth = MinesweeperDB.gridWidth * this.CELL_SIZE;
            const gridHeight = MinesweeperDB.gridHeight * this.CELL_SIZE;

            // Update minimum zoom based on container size
            this.MIN_ZOOM = this.calculateMinZoom(gameContainer.clientWidth, gameContainer.clientHeight);

            // Ensure current zoom is not below minimum
            this.zoom = Math.max(this.zoom, this.MIN_ZOOM);

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
            this.queueCellUpdate();
        }
    },

    // Queue cell update to prevent too frequent updates
    queueCellUpdate: function () {
        if (!this.cellUpdateQueued) {
            this.cellUpdateQueued = true;
            requestAnimationFrame(() => {
                const container = document.querySelector('.game-container');
                const grid = document.querySelector('.game-grid');
                this.updateVisibleCells(container, grid);
                this.cellUpdateQueued = false;
            });
        }
    },

    attachGameHandlers: function () {
        const container = document.querySelector('.game-container');
        const grid = document.querySelector('.game-grid');
        const settingsToggle = document.querySelector('.settings-toggle');
        const settingsDropdown = document.querySelector('.settings-dropdown');
        const newGridButton = document.querySelector('.new-grid-button');
        const logoutButton = document.querySelector('.logout-button');

        if (!container || !grid) return;

        // Clear any existing animation frames when component unmounts
        window.addEventListener('beforeunload', () => {
            if (this.moveAnimationFrame) cancelAnimationFrame(this.moveAnimationFrame);
            if (this.zoomAnimationFrame) cancelAnimationFrame(this.zoomAnimationFrame);
        });

        // Edge scrolling
        const updateEdgeScroll = () => {
            const rect = container.getBoundingClientRect();
            const mouseX = this.lastX - rect.left;
            const mouseY = this.lastY - rect.top;
            let moved = false;

            if (!this.isDragging) { // Only edge scroll when not dragging
                const speed = this.EDGE_SCROLL_SPEED * (1 / this.zoom);

                if (mouseX < this.EDGE_SCROLL_THRESHOLD) {
                    this.offsetX += speed;
                    moved = true;
                } else if (mouseX > rect.width - this.EDGE_SCROLL_THRESHOLD) {
                    this.offsetX -= speed;
                    moved = true;
                }

                if (mouseY < this.EDGE_SCROLL_THRESHOLD) {
                    this.offsetY += speed;
                    moved = true;
                } else if (mouseY > rect.height - this.EDGE_SCROLL_THRESHOLD) {
                    this.offsetY -= speed;
                    moved = true;
                }

                if (moved) {
                    this.clampOffset(container);
                    this.updateGridTransform();
                }
            }

            requestAnimationFrame(updateEdgeScroll);
        };

        // Start edge scrolling loop
        requestAnimationFrame(updateEdgeScroll);

        // Track mouse position for edge scrolling
        container.addEventListener('mousemove', (e) => {
            this.lastX = e.clientX;
            this.lastY = e.clientY;
        });

        // Continuous zoom handling
        const updateZoom = () => {
            if (this.activeZoom !== null) {
                const zoomSpeed = this.calculateZoomSpeed(this.zoom);
                const delta = this.activeZoom * zoomSpeed;
                const newZoom = Math.max(this.MIN_ZOOM, Math.min(this.MAX_ZOOM, this.zoom + delta));

                if (newZoom !== this.zoom) {
                    // Get container center for zooming
                    const rect = container.getBoundingClientRect();
                    const centerX = rect.width / 2;
                    const centerY = rect.height / 2;

                    // Calculate the point on the grid where we're zooming
                    const gridX = (centerX - this.offsetX) / this.zoom;
                    const gridY = (centerY - this.offsetY) / this.zoom;

                    // Calculate new offsets to keep the center point fixed
                    this.offsetX = centerX - gridX * newZoom;
                    this.offsetY = centerY - gridY * newZoom;

                    // Update zoom level
                    this.zoom = newZoom;

                    // If we're at minimum zoom, recenter the grid
                    if (this.zoom === this.MIN_ZOOM) {
                        this.centerGrid();
                    } else {
                        this.clampOffset(container);
                        this.updateGridTransform();
                    }
                }

                this.zoomAnimationFrame = requestAnimationFrame(updateZoom);
            }
        };

        // Update minimum zoom on window resize
        window.addEventListener('resize', () => {
            this.centerGrid();
        });

        // Settings menu toggle
        settingsToggle?.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent click from reaching document
            settingsDropdown?.classList.toggle('hidden');
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!settingsDropdown?.contains(e.target) && !settingsToggle?.contains(e.target)) {
                settingsDropdown?.classList.add('hidden');
            }
        });

        // New Grid button
        newGridButton?.addEventListener('click', async (e) => {
            e.stopPropagation(); // Prevent click from reaching document
            if (confirm('Are you sure you want to generate a new grid? This will affect all players.')) {
                await MinesweeperDB.regenerateGrid();
                // Force a complete grid refresh
                const grid = document.querySelector('.game-grid');
                if (grid) {
                    grid.innerHTML = this.createGrid();
                }
                await this.renderMinesweeperState();
                settingsDropdown?.classList.add('hidden');
            }
        });

        // Logout button
        logoutButton?.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent click from reaching document
            window.location.hash = '#login';
            settingsDropdown?.classList.add('hidden');
        });

        // Mouse drag handling
        container.addEventListener('mousedown', (e) => {
            if (e.button === 1) { // Middle mouse button only
                e.preventDefault(); // Prevent default middle-click behavior
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

                // Clamp the offset values
                this.clampOffset(container);
                this.updateGridTransform();
            }
        });

        window.addEventListener('mouseup', (e) => {
            if (this.isDragging) {
                e.preventDefault(); // Prevent any click events if we were dragging
                e.stopPropagation();
                this.isDragging = false;
                container.classList.remove('grabbing');
            }
        });

        // Mouse wheel zoom
        container.addEventListener('wheel', (e) => {
            e.preventDefault();
            const zoomSpeed = this.calculateZoomSpeed(this.zoom);
            const delta = -Math.sign(e.deltaY) * zoomSpeed;
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
                    this.clampOffset(container);
                    this.updateGridTransform();
                }
            }
        });

        // Keyboard movement
        const updateMovement = () => {
            if (this.pressedKeys.size > 0) {
                const moveSpeed = this.calculateMoveSpeed(this.zoom);

                if (this.pressedKeys.has('w') || this.pressedKeys.has('arrowup')) {
                    this.offsetY += moveSpeed;
                }
                if (this.pressedKeys.has('s') || this.pressedKeys.has('arrowdown')) {
                    this.offsetY -= moveSpeed;
                }
                if (this.pressedKeys.has('a') || this.pressedKeys.has('arrowleft')) {
                    this.offsetX += moveSpeed;
                }
                if (this.pressedKeys.has('d') || this.pressedKeys.has('arrowright')) {
                    this.offsetX -= moveSpeed;
                }

                this.clampOffset(container);
                this.updateGridTransform();

                // Continue animation loop only if keys are still pressed
                this.moveAnimationFrame = requestAnimationFrame(updateMovement);
            }
        };

        // Keyboard zoom and movement
        window.addEventListener('keydown', (e) => {
            const key = e.key.toLowerCase();

            // Handle movement keys
            if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
                if (!this.pressedKeys.has(key)) {
                    this.pressedKeys.add(key);
                    // Start animation loop if it's not already running
                    if (this.pressedKeys.size === 1) {
                        this.moveAnimationFrame = requestAnimationFrame(updateMovement);
                    }
                }
            }

            // Handle zoom keys
            if ((key === '=' || key === '+' || key === '-' || key === '_') && this.activeZoom === null) {
                e.preventDefault(); // Prevent browser zoom
                this.activeZoom = (key === '=' || key === '+') ? 1 : -1;
                this.zoomAnimationFrame = requestAnimationFrame(updateZoom);
            }
        });

        window.addEventListener('keyup', (e) => {
            const key = e.key.toLowerCase();

            // Handle movement keys
            this.pressedKeys.delete(key);
            if (this.pressedKeys.size === 0 && this.moveAnimationFrame) {
                cancelAnimationFrame(this.moveAnimationFrame);
                this.moveAnimationFrame = null;
            }

            // Handle zoom keys
            if ((key === '=' || key === '+' || key === '-' || key === '_') &&
                ((key === '=' || key === '+') ? 1 : -1) === this.activeZoom) {
                this.activeZoom = null;
                if (this.zoomAnimationFrame) {
                    cancelAnimationFrame(this.zoomAnimationFrame);
                    this.zoomAnimationFrame = null;
                }
            }
        });

        // Cell click handling
        grid.addEventListener('click', async (e) => {
            // Prevent cell interaction if we were just dragging
            if (this.isDragging) return;

            const cell = e.target.closest('.grid-cell');
            if (!cell) return;

            const x = parseInt(cell.dataset.x);
            const y = parseInt(cell.dataset.y);
            const key = `${x},${y}`;

            // Check if cell has any flag
            const marker = MinesweeperDB.mines.markers.get(key);
            if (marker) {
                // Block click if there's any flag
                return;
            }

            // Otherwise proceed with reveal
            await MinesweeperDB.revealCell(x, y, GameState.currentUser.username);
            await this.renderMinesweeperState();
        });

        grid.addEventListener('contextmenu', async (e) => {
            e.preventDefault();

            // Prevent cell interaction if we were just dragging
            if (this.isDragging) return;

            const cell = e.target.closest('.grid-cell');
            if (!cell) return;

            const x = parseInt(cell.dataset.x);
            const y = parseInt(cell.dataset.y);
            const key = `${x},${y}`;

            // Check if cell has any flag
            const marker = MinesweeperDB.mines.markers.get(key);
            if (marker) {
                // Remove any flag
                await MinesweeperDB.toggleMarker(x, y, marker.username, marker.avatar);
            } else {
                // Add my flag
                await MinesweeperDB.setMarker(x, y, GameState.currentUser.username, GameState.currentUser.avatar);
            }
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
    },

    // Calculate zoom speed based on current zoom level
    calculateZoomSpeed: function (currentZoom) {
        // Slower zooming at higher zoom levels for finer control
        // Faster zooming at lower zoom levels for quick overview changes
        return this.BASE_ZOOM_SPEED * (1 / (currentZoom * 2));
    },

    // Calculate movement speed based on current zoom level
    calculateMoveSpeed: function (currentZoom) {
        // Faster movement when zoomed out, slower when zoomed in
        return this.BASE_MOVE_SPEED * (1 / currentZoom);
    },

    // Calculate visible grid bounds with margin
    getVisibleBounds: function (container) {
        if (!container) return null;

        const rect = container.getBoundingClientRect();
        const scale = 1 / this.zoom;

        // Convert screen coordinates to grid coordinates
        let left = Math.floor((-this.offsetX * scale) / this.CELL_SIZE) - this.RENDER_MARGIN;
        let top = Math.floor((-this.offsetY * scale) / this.CELL_SIZE) - this.RENDER_MARGIN;
        let right = Math.ceil((rect.width * scale - this.offsetX * scale) / this.CELL_SIZE) + this.RENDER_MARGIN;
        let bottom = Math.ceil((rect.height * scale - this.offsetY * scale) / this.CELL_SIZE) + this.RENDER_MARGIN;

        // Clamp to grid boundaries
        return {
            left: Math.max(0, left),
            top: Math.max(0, top),
            right: Math.min(MinesweeperDB.gridWidth, right),
            bottom: Math.min(MinesweeperDB.gridHeight, bottom)
        };
    },

    // Get or create a cell element from the pool
    getCellElement: function () {
        if (this.cellPool.length > 0) {
            return this.cellPool.pop();
        }
        const cell = document.createElement('div');
        cell.className = 'grid-cell';
        return cell;
    },

    // Return a cell element to the pool
    recycleCellElement: function (cell) {
        if (this.cellPool.length < this.CELL_POOL_SIZE) {
            cell.style.display = 'none';
            this.cellPool.push(cell);
        } else {
            cell.remove();
        }
    },

    // Update visible cells
    updateVisibleCells: function (container, grid) {
        if (!container || !grid) return;

        const bounds = this.getVisibleBounds(container);
        if (!bounds) return;

        // Track cells to remove
        const cellsToRemove = new Set(this.visibleCells.keys());

        // Create document fragment for batch updates
        const fragment = document.createDocumentFragment();
        let updatesNeeded = false;

        // Update or create visible cells
        for (let y = bounds.top; y < bounds.bottom; y++) {
            for (let x = bounds.left; x < bounds.right; x++) {
                const key = `${x},${y}`;
                cellsToRemove.delete(key);

                if (!this.visibleCells.has(key)) {
                    const cell = this.createCell(x, y);
                    fragment.appendChild(cell);
                    this.visibleCells.set(key, cell);
                    updatesNeeded = true;
                }
            }
        }

        // Remove out-of-view cells
        for (const key of cellsToRemove) {
            const cell = this.visibleCells.get(key);
            cell.remove();
            this.visibleCells.delete(key);
            updatesNeeded = true;
        }

        // Batch DOM updates
        if (fragment.children.length > 0) {
            grid.appendChild(fragment);
        }

        // Only update states if needed
        if (updatesNeeded) {
            this.updateVisibleCellStates();
        }
    },

    // Update the states of visible cells
    updateVisibleCellStates: function () {
        const updates = [];

        for (const [key, cell] of this.visibleCells.entries()) {
            const [x, y] = key.split(',').map(Number);
            const update = { cell, classes: ['grid-cell'], html: '', color: '' };

            if (MinesweeperDB.mines.revealed.has(key)) {
                update.classes.push('revealed');
                if (MinesweeperDB.isMine(x, y)) {
                    update.classes.push('mine');
                    update.html = '💣';
                } else {
                    const count = MinesweeperDB.getAdjacentMines(x, y);
                    update.html = count || '';
                    if (count) {
                        update.classes.push(`adjacent-${count}`);
                    } else {
                        update.classes.push('empty');
                    }
                }
            } else {
                const marker = MinesweeperDB.mines.markers.get(key);
                if (marker) {
                    update.html = marker.avatar;
                    update.color = marker.color;
                }
            }
            updates.push(update);
        }

        // Batch apply all updates
        requestAnimationFrame(() => {
            updates.forEach(update => {
                update.cell.className = update.classes.join(' ');
                update.cell.innerHTML = update.html;
                update.cell.style.color = update.color;
            });
        });
    },

    // Create a cell element
    createCell: function (x, y) {
        const cell = document.createElement('div');
        cell.className = 'grid-cell';
        cell.dataset.x = x;
        cell.dataset.y = y;
        cell.style.gridColumn = x + 1;
        cell.style.gridRow = y + 1;
        return cell;
    }
}; 