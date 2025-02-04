const PlayScreen = {
    CELL_SIZE: 25, // pixels
    UPDATE_INTERVAL: 100, // Main game state update interval (ms)
    MARKER_UPDATE_INTERVAL: 1000 / 60, // Player marker update interval (~60 FPS)
    MAX_ZOOM: 2.0, // 200% maximum zoom
    MIN_ZOOM_CAP: 0.5, // Never zoom out beyond 50%
    BASE_MOVE_SPEED: 20, // Base speed for keyboard movement
    BASE_ZOOM_SPEED: 0.1, // Base speed for zooming
    EDGE_SCROLL_THRESHOLD: 20, // Pixels from edge to trigger scrolling
    EDGE_SCROLL_SPEED: 15, // Base speed for edge scrolling
    RENDER_MARGIN: 2, // Extra cells to render beyond viewport
    CELL_POOL_SIZE: 2500, // Pool of reusable cells (50x50 visible area)

    // Movement simulation constants
    MOVEMENT_UPDATE_INTERVAL: 50, // Movement update interval (ms)
    MIN_MOVE_DURATION: 300, // Minimum time to reach target (ms)
    MAX_MOVE_DURATION: 800, // Maximum time to reach target (ms)
    MIN_IDLE_TIME: 800, // Minimum time to stay idle (ms)
    MAX_IDLE_TIME: 2500, // Maximum time to stay idle (ms)
    MIN_MOVE_DISTANCE: 1, // Minimum cells to move
    MAX_MOVE_DISTANCE: 5, // Maximum cells to move

    // Track movement state for each player
    playerMovements: new Map(), // Map of username -> movement state
    movementUpdateInterval: null,
    lastMovementUpdate: 0,

    // Generate a new target position near current position
    generateTargetPosition: function (currentX, currentY) {
        // Pick a random distance (1-5 cells)
        const distance = Math.floor(Math.random() * (this.MAX_MOVE_DISTANCE - this.MIN_MOVE_DISTANCE + 1)) + this.MIN_MOVE_DISTANCE;

        // Pick one of 8 directions (like adjacent cells)
        const directions = [
            { x: -1, y: -1 }, { x: 0, y: -1 }, { x: 1, y: -1 },
            { x: -1, y: 0 }, { x: 1, y: 0 },
            { x: -1, y: 1 }, { x: 0, y: 1 }, { x: 1, y: 1 }
        ];
        const dir = directions[Math.floor(Math.random() * directions.length)];

        // Calculate new position
        let targetX = currentX + (dir.x * distance);
        let targetY = currentY + (dir.y * distance);

        // Clamp to grid bounds
        const gridCenterX = Math.floor(MinesweeperDB.gridWidth / 2);
        const gridCenterY = Math.floor(MinesweeperDB.gridHeight / 2);
        targetX = Math.max(-gridCenterX, Math.min(gridCenterX, targetX));
        targetY = Math.max(-gridCenterY, Math.min(gridCenterY, targetY));

        return { x: targetX, y: targetY };
    },

    // Initialize movement state for a player
    initPlayerMovement: function (player) {
        if (player.username === GameState.currentUser.username) return;

        const state = {
            currentX: player.position.x,
            currentY: player.position.y,
            targetX: player.position.x,
            targetY: player.position.y,
            startX: player.position.x,
            startY: player.position.y,
            startTime: performance.now(),
            duration: 0,
            isMoving: false,
            idleUntil: performance.now() + Math.random() * (this.MAX_IDLE_TIME - this.MIN_IDLE_TIME) + this.MIN_IDLE_TIME
        };

        this.playerMovements.set(player.username, state);
    },

    // Update movement state for all players
    updatePlayerMovements: function (timestamp) {
        if (!this.cachedPlayerData) return;

        // Initialize movement state for new players
        this.cachedPlayerData.forEach(player => {
            if (!this.playerMovements.has(player.username)) {
                this.initPlayerMovement(player);
            }
        });

        // Update each player's movement
        this.playerMovements.forEach((state, username) => {
            if (username === GameState.currentUser.username) return;

            if (state.isMoving) {
                // Update current position based on progress
                const progress = Math.min(1, (timestamp - state.startTime) / state.duration);
                state.currentX = state.startX + (state.targetX - state.startX) * progress;
                state.currentY = state.startY + (state.targetY - state.startY) * progress;

                // Check if movement is complete
                if (progress >= 1) {
                    state.isMoving = false;
                    state.currentX = state.targetX;
                    state.currentY = state.targetY;
                    state.idleUntil = timestamp + Math.random() * (this.MAX_IDLE_TIME - this.MIN_IDLE_TIME) + this.MIN_IDLE_TIME;
                }
            } else if (timestamp >= state.idleUntil) {
                // Start new movement
                state.isMoving = true;
                state.startX = state.currentX;
                state.startY = state.currentY;
                const target = this.generateTargetPosition(state.currentX, state.currentY);
                state.targetX = target.x;
                state.targetY = target.y;
                state.startTime = timestamp;

                // Calculate duration based on distance
                const distance = Math.hypot(state.targetX - state.startX, state.targetY - state.startY);
                const progress = Math.min(1, distance / this.MAX_MOVE_DISTANCE);
                state.duration = this.MIN_MOVE_DURATION + progress * (this.MAX_MOVE_DURATION - this.MIN_MOVE_DURATION);
            }
        });
    },

    // Start movement updates
    startMovementUpdates: function () {
        const updateMovements = (timestamp) => {
            // Check if enough time has passed since last update
            if (timestamp - this.lastMovementUpdate >= this.MOVEMENT_UPDATE_INTERVAL) {
                this.lastMovementUpdate = timestamp;
                this.updatePlayerMovements(timestamp);
            }
            this.movementUpdateInterval = requestAnimationFrame(updateMovements);
        };
        this.movementUpdateInterval = requestAnimationFrame(updateMovements);
    },

    // Stop movement updates
    stopMovementUpdates: function () {
        if (this.movementUpdateInterval) {
            cancelAnimationFrame(this.movementUpdateInterval);
            this.movementUpdateInterval = null;
        }
    },

    updateInterval: null,
    markerUpdateFrame: null,
    lastMarkerUpdate: 0,
    cachedPlayerData: null, // Cache for player data between updates
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
                    <div class="player-cursors"></div>
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
        this.startMarkerUpdates();
        this.startMovementUpdates(); // Start movement simulation
    },

    createGrid: function () {
        // No longer need to create all cells upfront
        return '';
    },

    getPlayerDirection: function (playerX, playerY) {
        // Convert grid coordinates to screen coordinates
        const container = document.querySelector('.game-container');
        if (!container) return 0;

        // Get current viewport center in grid coordinates
        const rect = container.getBoundingClientRect();
        const gridCenterX = Math.floor(MinesweeperDB.gridWidth / 2);
        const gridCenterY = Math.floor(MinesweeperDB.gridHeight / 2);
        const viewportCenterX = (-this.offsetX / this.zoom + rect.width / (2 * this.zoom)) / this.CELL_SIZE - gridCenterX;
        const viewportCenterY = (-this.offsetY / this.zoom + rect.height / (2 * this.zoom)) / this.CELL_SIZE - gridCenterY;

        // Calculate direction from viewport center to player
        const dx = playerX - viewportCenterX;
        const dy = playerY - viewportCenterY;

        return Math.atan2(dy, dx);
    },

    // Calculate if a player is visible in the current viewport
    isPlayerVisible: function (playerX, playerY, container) {
        if (!container) return false;

        const bounds = this.getVisibleBounds(container);
        if (!bounds) return false;

        // Add a small margin to the bounds
        const margin = 2;
        return playerX >= bounds.left - margin &&
            playerX <= bounds.right + margin &&
            playerY >= bounds.top - margin &&
            playerY <= bounds.bottom + margin;
    },

    // Calculate screen position for a player
    calculatePlayerScreenPosition: function (x, y, container) {
        if (!container) return null;

        const rect = container.getBoundingClientRect();
        const gridCenterX = Math.floor(MinesweeperDB.gridWidth / 2);
        const gridCenterY = Math.floor(MinesweeperDB.gridHeight / 2);

        // Convert grid coordinates to screen coordinates, accounting for centered origin
        // Add 0.5 to x and y to target the center of the cell
        const screenX = this.offsetX + ((x + gridCenterX + 0.5) * this.CELL_SIZE * this.zoom);
        const screenY = this.offsetY + ((y + gridCenterY + 0.5) * this.CELL_SIZE * this.zoom);

        return {
            x: screenX,
            y: screenY,
            isOnScreen: screenX >= 0 && screenX <= rect.width && screenY >= 0 && screenY <= rect.height
        };
    },

    // Calculate position on screen edge for an angle
    calculateEdgePosition: function (angle, container) {
        // Increase margin to account for indicator size
        const margin = {
            top: 40,    // Account for indicator height
            right: 40,  // Account for indicator width
            bottom: 40, // Account for indicator height
            left: 40    // Account for indicator width
        };

        const width = container.clientWidth - (margin.left + margin.right);
        const height = container.clientHeight - (margin.top + margin.bottom);

        // Normalize angle to 0-2π range
        const normalizedAngle = (angle + 2 * Math.PI) % (2 * Math.PI);

        // Calculate position on screen edge
        let x, y;

        // Right edge
        if (normalizedAngle < Math.PI / 4 || normalizedAngle > 7 * Math.PI / 4) {
            x = width + margin.left;
            y = height / 2 + margin.top + Math.tan(normalizedAngle) * width / 2;
        }
        // Bottom edge
        else if (normalizedAngle < 3 * Math.PI / 4) {
            y = height + margin.top;
            x = width / 2 + margin.left + Math.tan(Math.PI / 2 - normalizedAngle) * height / 2;
        }
        // Left edge
        else if (normalizedAngle < 5 * Math.PI / 4) {
            x = margin.left;
            y = height / 2 + margin.top - Math.tan(normalizedAngle) * width / 2;
        }
        // Top edge
        else {
            y = margin.top;
            x = width / 2 + margin.left - Math.tan(Math.PI / 2 - normalizedAngle) * height / 2;
        }

        // Clamp positions to screen bounds with margins
        x = Math.max(margin.left, Math.min(width + margin.left, x));
        y = Math.max(margin.top, Math.min(height + margin.top, y));

        return { x, y, angle: normalizedAngle };
    },

    // Get arrow character for angle
    getDirectionArrow: function (angle) {
        // Convert angle to 8-direction arrow
        const normalizedAngle = (angle + 2 * Math.PI) % (2 * Math.PI);
        const sector = Math.round(normalizedAngle / (Math.PI / 4));

        const arrows = ['→', '↘', '↓', '↙', '←', '↖', '↑', '↗', '→'];
        return arrows[sector];
    },

    renderPlayers: async function () {
        if (!this.cachedPlayerData) {
            this.cachedPlayerData = await MockDB.getOnlinePlayers();
        }
        await this.renderPlayerMarkers(this.cachedPlayerData);
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

            // Calculate the center position, accounting for centered origin
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

        // Start periodic updates for game state
        this.updateInterval = setInterval(async () => {
            try {
                await Promise.all([
                    MockDB.loadPlayers(), // Refresh player data
                    MinesweeperDB.loadMines() // Refresh mines data
                ]);
                // Cache the player data for marker updates
                this.cachedPlayerData = await MockDB.getOnlinePlayers();
                // Only update game state here, markers are updated separately
                await this.renderMinesweeperState();
            } catch (error) {
                console.error('Error during periodic update:', error);
            }
        }, this.UPDATE_INTERVAL);
    },

    startMarkerUpdates: function () {
        const updateMarkers = async (timestamp) => {
            // Check if enough time has passed since last update
            if (timestamp - this.lastMarkerUpdate >= this.MARKER_UPDATE_INTERVAL) {
                this.lastMarkerUpdate = timestamp;
                if (this.cachedPlayerData) {
                    await this.renderPlayerMarkers(this.cachedPlayerData);
                }
            }

            this.markerUpdateFrame = requestAnimationFrame(updateMarkers);
        };

        this.markerUpdateFrame = requestAnimationFrame(updateMarkers);
    },

    stopUpdates: function () {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
        if (this.markerUpdateFrame) {
            cancelAnimationFrame(this.markerUpdateFrame);
            this.markerUpdateFrame = null;
        }
        this.stopMovementUpdates(); // Stop movement simulation
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
        const gridCenterX = Math.floor(MinesweeperDB.gridWidth / 2);
        const gridCenterY = Math.floor(MinesweeperDB.gridHeight / 2);

        // Convert screen coordinates to grid coordinates, accounting for centered origin
        let left = Math.floor((-this.offsetX * scale) / this.CELL_SIZE) - this.RENDER_MARGIN - gridCenterX;
        let top = Math.floor((-this.offsetY * scale) / this.CELL_SIZE) - this.RENDER_MARGIN - gridCenterY;
        let right = Math.ceil((rect.width * scale - this.offsetX * scale) / this.CELL_SIZE) + this.RENDER_MARGIN - gridCenterX;
        let bottom = Math.ceil((rect.height * scale - this.offsetY * scale) / this.CELL_SIZE) + this.RENDER_MARGIN - gridCenterY;

        // Clamp to grid boundaries, accounting for centered origin
        return {
            left: Math.max(-gridCenterX, left),
            top: Math.max(-gridCenterY, top),
            right: Math.min(gridCenterX, right),
            bottom: Math.min(gridCenterY, bottom)
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

        // Offset grid coordinates to center 0,0
        const gridCenterX = Math.floor(MinesweeperDB.gridWidth / 2);
        const gridCenterY = Math.floor(MinesweeperDB.gridHeight / 2);
        cell.style.gridColumn = x + gridCenterX + 1;
        cell.style.gridRow = y + gridCenterY + 1;
        return cell;
    },

    // New method specifically for rendering markers
    renderPlayerMarkers: async function (players) {
        const indicatorsContainer = document.querySelector('.player-indicators');
        const cursorsContainer = document.querySelector('.player-cursors');
        const container = document.querySelector('.game-container');

        if (!indicatorsContainer || !cursorsContainer || !container) {
            return;
        }

        indicatorsContainer.innerHTML = '';
        cursorsContainer.innerHTML = '';

        // Create and position indicators/cursors for each player
        players.forEach(player => {
            if (player.username === GameState.currentUser.username) return;

            // Get simulated position if available, otherwise use static position
            const movement = this.playerMovements.get(player.username);
            const x = movement ? movement.currentX : player.position.x;
            const y = movement ? movement.currentY : player.position.y;

            const isVisible = this.isPlayerVisible(x, y, container);
            const screenPos = this.calculatePlayerScreenPosition(x, y, container);
            const score = MinesweeperDB.getScore(player.username);

            if (isVisible && screenPos) {
                // Player is visible on screen, show cursor
                const cursor = document.createElement('div');
                cursor.className = 'player-cursor';
                cursor.style.left = `${screenPos.x}px`;
                cursor.style.top = `${screenPos.y}px`;
                cursor.style.color = player.color;

                cursor.innerHTML = `
                    <div class="cursor-pointer"></div>
                    <div class="cursor-info">
                        <span class="cursor-avatar">${player.avatar}</span>
                        <span class="cursor-name">${player.username}</span>
                        <span class="cursor-score">${score}</span>
                    </div>
                `;

                cursorsContainer.appendChild(cursor);
            } else {
                // Player is off screen, show edge indicator
                const angle = this.getPlayerDirection(x, y);
                const pos = this.calculateEdgePosition(angle, container);

                const indicator = document.createElement('div');
                indicator.className = 'player-indicator';
                indicator.style.left = `${pos.x}px`;
                indicator.style.top = `${pos.y}px`;

                indicator.innerHTML = `
                    <span class="indicator-arrow">${this.getDirectionArrow(pos.angle)}</span>
                    <span class="indicator-avatar" style="background-color: ${player.color}20">${player.avatar}</span>
                    <span class="indicator-name">${player.username}</span>
                    <span class="indicator-score">${score}</span>
                `;

                indicatorsContainer.appendChild(indicator);
            }
        });
    }
}; 