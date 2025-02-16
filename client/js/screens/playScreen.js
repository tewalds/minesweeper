const PlayScreen = {
    CELL_SIZE: 25, // pixels
    UPDATE_INTERVAL: 100, // Main game state update interval (ms)
    MARKER_UPDATE_INTERVAL: 1000 / 60, // Player marker update interval (~60 FPS)
    MAX_ZOOM: 2.0, // 200% maximum zoom
    MIN_ZOOM_CAP: 0.5, // Never zoom out beyond 50%
    BASE_MOVE_SPEED: 1000, // Pixels per second for movement
    BASE_ZOOM_SPEED: 0.1, // Base speed for zooming
    EDGE_SCROLL_THRESHOLD: 20, // Pixels from edge to trigger scrolling
    EDGE_SCROLL_SPEED: 750, // Pixels per second for edge scrolling
    RENDER_MARGIN: 2, // Extra cells to render beyond viewport
    CELL_POOL_SIZE: 2500, // Pool of reusable cells (50x50 visible area)

    // Cursor offset for indicators and arrows (at 100% zoom)
    CURSOR_OFFSET_X: 20, // Half cell width
    CURSOR_OFFSET_Y: 30, // Half cell height

    // Movement simulation constants
    MOVEMENT_UPDATE_INTERVAL: 50, // Movement update interval (ms)
    MIN_MOVE_DURATION: 300, // Minimum time to reach target (ms)
    MAX_MOVE_DURATION: 800, // Maximum time to reach target (ms)
    MIN_IDLE_TIME: 800, // Minimum time to stay idle (ms)
    MAX_IDLE_TIME: 2500, // Maximum time to stay idle (ms)
    MIN_MOVE_DISTANCE: 1, // Minimum cells to move
    MAX_MOVE_DISTANCE: 3, // Maximum cells to move

    // Track movement state for each player
    playerMovements: new Map(), // Map of username -> movement state
    movementUpdateInterval: null,
    lastMovementUpdate: 0,

    // Track the current view for efficient updates
    currentView: null,

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
            hasClickedThisPhase: false, // Track if player has clicked in current phase
            idleUntil: performance.now() + Math.random() * (this.MAX_IDLE_TIME - this.MIN_IDLE_TIME) + this.MIN_IDLE_TIME
        };

        // Initialize AI knowledge with correct spawn position
        MinesweeperAI.initPlayerKnowledge(player.username);
        MinesweeperAI.updatePosition(player.username, player.position.x, player.position.y);

        // Also update AI's knowledge of any cells already revealed in their vision range
        const knowledge = MinesweeperAI.getKnowledge(player.username);
        MinesweeperDB.mines.revealed.forEach((value, key) => {
            const [x, y] = key.split(',').map(Number);
            if (MinesweeperAI.isInVisionRange(x, y, player.position.x, player.position.y)) {
                knowledge.revealed.add(key);
                // Add neighbors to frontier
                MinesweeperAI.getNeighbors(x, y, player.position.x, player.position.y).forEach(neighbor => {
                    const neighborKey = `${neighbor.x},${neighbor.y}`;
                    if (!knowledge.revealed.has(neighborKey) && !knowledge.flagged.has(neighborKey)) {
                        knowledge.frontier.add(neighborKey);
                    }
                });
            }
        });

        // Update knowledge of flags in vision range
        MinesweeperDB.mines.markers.forEach((marker, key) => {
            const [x, y] = key.split(',').map(Number);
            if (MinesweeperAI.isInVisionRange(x, y, player.position.x, player.position.y)) {
                if (marker.username === player.username) {
                    knowledge.flagged.add(key);
                }
            }
        });

        this.playerMovements.set(player.username, state);
    },

    // Update visual state immediately for a player action
    updateVisualState: function (x, y, username, avatar, action) {
        const key = `${x},${y}`;

        // Optimistically update the visual state
        if (action === 'flag') {
            MinesweeperDB.mines.markers.set(key, { username, avatar });
        } else if (action === 'unflag') {
            MinesweeperDB.mines.markers.delete(key);
        } else if (action === 'reveal') {
            MinesweeperDB.mines.revealed.add(key);
        }

        // Force an immediate visual update
        this.updateVisibleCellStates();
    },

    // Simulate a player click at a position
    simulatePlayerClick: async function (x, y, username, avatar) {
        if (this.isRegeneratingGrid) return;

        try {
            const key = `${x},${y}`;

            // Get AI's next move if this is a fake player
            if (username !== GameState.currentUser.username) {
                const nextMove = MinesweeperAI.getNextMove(username);
                if (nextMove && nextMove.certainty >= 0.8) {
                    // Use AI's suggested move instead
                    x = nextMove.x;
                    y = nextMove.y;
                    if (nextMove.action === 'flag') {
                        const marker = MinesweeperDB.mines.markers.get(`${x},${y}`);
                        if (marker?.username === username) {
                            // Remove own flag
                            this.updateVisualState(x, y, username, avatar, 'unflag');
                            await MinesweeperDB.toggleMarker(x, y, username, avatar);
                            MinesweeperAI.updateFlag(username, x, y, false);
                        } else if (!marker) {
                            // Place new flag
                            this.updateVisualState(x, y, username, avatar, 'flag');
                            await MinesweeperDB.setMarker(x, y, username, avatar);
                            MinesweeperAI.updateFlag(username, x, y, true);

                            // Handle additional mines if provided
                            if (nextMove.additionalMines) {
                                for (const mine of nextMove.additionalMines) {
                                    const mineMarker = MinesweeperDB.mines.markers.get(`${mine.x},${mine.y}`);
                                    if (!mineMarker) {
                                        this.updateVisualState(mine.x, mine.y, username, avatar, 'flag');
                                        await MinesweeperDB.setMarker(mine.x, mine.y, username, avatar);
                                        MinesweeperAI.updateFlag(username, mine.x, mine.y, true);
                                    }
                                }
                            }
                        }
                        return;
                    }
                }
            }

            // Check if cell has any flag
            const marker = MinesweeperDB.mines.markers.get(`${x},${y}`);
            if (marker?.username === username) {
                // Remove own flag
                this.updateVisualState(x, y, username, avatar, 'unflag');
                await MinesweeperDB.toggleMarker(x, y, username, avatar);
                if (username !== GameState.currentUser.username) {
                    MinesweeperAI.updateFlag(username, x, y, false);
                }
            } else if (!marker) {
                // Only reveal if cell isn't flagged
                if (!MinesweeperDB.mines.revealed.has(`${x},${y}`)) {
                    // First reveal the clicked cell
                    await MinesweeperDB.revealCell(x, y, username);
                    if (username !== GameState.currentUser.username) {
                        MinesweeperAI.updateKnowledge(username, x, y, MinesweeperDB.getAdjacentMines(x, y));
                    }

                    // Update visual state after all reveals are done
                    this.updateVisibleCells();
                }
            }
        } catch (error) {
            console.warn(`Click failed for ${username}:`, error);
            // On error, force a full state refresh to ensure consistency
            await MinesweeperDB.loadMines();
            this.updateVisibleCellStates();
        }
    },

    // Track grid regeneration state
    isRegeneratingGrid: false,

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

                // Update AI's knowledge of current position
                MinesweeperAI.updatePosition(username, Math.round(state.currentX), Math.round(state.currentY));

                // Check if movement is complete
                if (progress >= 1) {
                    state.isMoving = false;
                    state.currentX = state.targetX;
                    state.currentY = state.targetY;
                    state.idleUntil = timestamp + Math.random() * (this.MAX_IDLE_TIME - this.MIN_IDLE_TIME) + this.MIN_IDLE_TIME;

                    // Always trigger click at end of movement
                    const player = this.cachedPlayerData.find(p => p.username === username);
                    if (player) {
                        const cellX = Math.round(state.currentX);
                        const cellY = Math.round(state.currentY);
                        this.simulatePlayerClick(cellX, cellY, username, player.avatar).catch(error => {
                            console.warn(`Click failed for ${username}:`, error);
                        });
                    }
                }
            } else if (timestamp >= state.idleUntil) {
                // Get next move from AI
                const nextMove = MinesweeperAI.getNextMove(username);

                if (nextMove) {
                    if (nextMove.action === 'move') {
                        // Just move to new area without clicking
                        state.isMoving = true;
                        state.startX = state.currentX;
                        state.startY = state.currentY;
                        state.targetX = nextMove.x;
                        state.targetY = nextMove.y;
                        state.startTime = timestamp;

                        // Calculate duration based on distance
                        const distance = Math.hypot(state.targetX - state.startX, state.targetY - state.startY);
                        const progress = Math.min(1, distance / this.MAX_MOVE_DISTANCE);
                        state.duration = this.MIN_MOVE_DURATION + progress * (this.MAX_MOVE_DURATION - this.MIN_MOVE_DURATION);
                    } else {
                        // Move to target cell for action
                        state.isMoving = true;
                        state.startX = state.currentX;
                        state.startY = state.currentY;
                        state.targetX = nextMove.x;
                        state.targetY = nextMove.y;
                        state.startTime = timestamp;

                        // Calculate duration based on distance
                        const distance = Math.hypot(state.targetX - state.startX, state.targetY - state.startY);
                        const progress = Math.min(1, distance / this.MAX_MOVE_DISTANCE);
                        state.duration = this.MIN_MOVE_DURATION + progress * (this.MAX_MOVE_DURATION - this.MIN_MOVE_DURATION);
                    }
                } else {
                    // No move available, just wait longer
                    state.idleUntil = timestamp + Math.random() * (this.MAX_IDLE_TIME - this.MIN_IDLE_TIME) + this.MIN_IDLE_TIME;
                }
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
    isMouseInWindow: true,
    lastEdgeScrollTime: null,
    lastMovementTime: null,

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

    // Center the camera on a specific position
    centerOnPosition: function (x, y) {
        const container = document.querySelector('.game-container');
        const grid = document.querySelector('.game-grid');
        if (!container || !grid) return;

        const gridCenterX = Math.floor(MinesweeperDB.gridWidth / 2);
        const gridCenterY = Math.floor(MinesweeperDB.gridHeight / 2);

        // Calculate the position in screen coordinates
        const screenX = (x + gridCenterX) * this.CELL_SIZE;
        const screenY = (y + gridCenterY) * this.CELL_SIZE;

        // Center the view on this position
        this.offsetX = (container.clientWidth / 2) - (screenX * this.zoom);
        this.offsetY = (container.clientHeight / 2) - (screenY * this.zoom);

        // Ensure we stay within bounds
        this.clampOffset(container);
        this.updateGridTransform();
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
        console.log('PlayScreen.show() - Starting initialization');
        // Check if we're in server mode
        const isServerMode = GameState.connection instanceof WebSocketGameConnection;
        console.log('PlayScreen - Connection mode:', isServerMode ? 'server' : 'local');

        // Set up event handlers for connection first if in server mode
        if (isServerMode) {
            console.log('PlayScreen - Setting up server mode handlers');

            // Check if we already have grid info
            const existingGridInfo = GameState.connection.getGridInfo();
            if (existingGridInfo) {
                console.log('Using existing grid info:', existingGridInfo);
                MinesweeperDB.gridWidth = existingGridInfo.width;
                MinesweeperDB.gridHeight = existingGridInfo.height;
            }

            // Debug current state
            console.log('Current GameState:', {
                user: GameState.currentUser,
                connection: GameState.connection ? 'Connected' : 'Not connected'
            });

            GameState.connection.onUpdate = (state, x, y, userId) => {
                this.updateCell(x, y, state);
            };

            GameState.connection.onGridInfo = (width, height, userId) => {
                console.log('📊 Server grid info received:', {
                    width,
                    height,
                    userId,
                    currentUser: GameState.currentUser.username,
                    isCurrentUser: userId === GameState.currentUser.userId,
                    previousDimensions: {
                        width: MinesweeperDB.gridWidth,
                        height: MinesweeperDB.gridHeight
                    }
                });

                // Store grid dimensions and update display
                MinesweeperDB.gridWidth = width;
                MinesweeperDB.gridHeight = height;

                // Update grid CSS properties
                const grid = document.querySelector('.game-grid');
                if (grid) {
                    grid.style.width = `${width * this.CELL_SIZE}px`;
                    grid.style.height = `${height * this.CELL_SIZE}px`;
                    grid.style.gridTemplateColumns = `repeat(${width}, ${this.CELL_SIZE}px)`;
                    grid.style.gridTemplateRows = `repeat(${height}, ${this.CELL_SIZE}px)`;
                }

                // Clear all existing cells since we're resizing
                this.visibleCells.forEach(cell => cell.remove());
                this.visibleCells.clear();

                this.centerGrid();

                // Force a complete refresh of visible cells
                const container = document.querySelector('.game-container');
                if (container && grid) {
                    this.updateVisibleCells(container, grid);
                }

                console.log('Grid dimensions updated and centered');
            };

            GameState.connection.onPlayerJoin = (userId, name) => {
                console.log('👤 Player joined:', {
                    userId,
                    name,
                    currentUser: GameState.currentUser.username,
                    isCurrentUser: userId === GameState.currentUser.userId
                });
            };
        }

        // Only try to get score in local mode
        const score = isServerMode ? 0 : await MinesweeperDB.getScore(GameState.currentUser.username);
        console.log('PlayScreen - Initial score:', score);

        const html = `
            <div class="play-screen">
                <div class="player-info-container">
                    <div class="player-info">
                        <span style="color: ${GameState.currentUser.color}">${GameState.currentUser.avatar || '👤'}</span>
                        <span>${GameState.currentUser.username}</span>
                        <span class="player-score">Score: ${score}</span>
                    </div>
                    <div class="settings-menu">
                        <button class="settings-toggle">⚙️ Menu</button>
                        <div class="settings-dropdown hidden">
                            <button class="logout-button">Logout</button>
                        </div>
                    </div>
                </div>
                <div class="game-container">
                    <div class="game-grid"></div>
                    <div class="player-indicators"></div>
                    <div class="player-cursors"></div>
                </div>
            </div>
        `;
        container.innerHTML = html;
        console.log('PlayScreen - HTML template rendered');

        // Initialize game grid
        await this.initializeGrid();
        console.log('PlayScreen - Grid initialized');

        this.attachGameHandlers();
        console.log('PlayScreen - Game handlers attached');

        // Start update loops
        this.startUpdates();
        this.startMarkerUpdates();
        this.startMovementUpdates();
        console.log('PlayScreen - Update loops started');
    },

    // Helper to get human-readable state descriptions
    getStateDescription: function (state) {
        if (state >= 0 && state <= 8) return `REVEALED (${state} mines)`;
        switch (state) {
            case 9: return 'BOMB';
            case 10: return 'HIDDEN';
            case 11: return 'MARKED';
            default: return `UNKNOWN (${state})`;
        }
    },

    initializeGrid: async function () {
        console.log('PlayScreen.initializeGrid() - Starting grid initialization');

        const isServerMode = GameState.connection instanceof WebSocketGameConnection;
        console.log('Grid initialization - Mode:', isServerMode ? 'server' : 'local');

        if (isServerMode) {
            // In server mode, initialize empty mines data structure
            console.log('Initializing empty mines data for server mode');
            MinesweeperDB.mines = {
                revealed: new Set(),
                markers: new Map()
            };

            // Check if we already have grid info from the server
            const gridInfo = GameState.connection.getGridInfo();
            if (gridInfo) {
                console.log('Using cached grid info:', gridInfo);
                MinesweeperDB.gridWidth = gridInfo.width;
                MinesweeperDB.gridHeight = gridInfo.height;
            } else {
                console.log('No grid info yet, starting with 0x0');
                MinesweeperDB.gridWidth = 0;
                MinesweeperDB.gridHeight = 0;
            }
        } else {
            // In local mode, initialize from DB
            console.log('Loading local grid from DB...');
            await MinesweeperDB.loadMines();
            console.log('Local grid loaded - Dimensions:', {
                width: MinesweeperDB.gridWidth,
                height: MinesweeperDB.gridHeight
            });
        }

        // Initialize the grid container
        const grid = document.querySelector('.game-grid');
        if (grid) {
            // Set up grid CSS properties
            grid.style.display = 'grid';
            grid.style.width = `${MinesweeperDB.gridWidth * this.CELL_SIZE}px`;
            grid.style.height = `${MinesweeperDB.gridHeight * this.CELL_SIZE}px`;
            grid.style.gridTemplateColumns = `repeat(${MinesweeperDB.gridWidth}, ${this.CELL_SIZE}px)`;
            grid.style.gridTemplateRows = `repeat(${MinesweeperDB.gridHeight}, ${this.CELL_SIZE}px)`;
            grid.style.position = 'relative';
            grid.style.transformOrigin = 'top left';
            grid.style.setProperty('--cell-size', `${this.CELL_SIZE}px`);
            console.log('Grid container initialized with cell size:', this.CELL_SIZE);
        }

        // Center the grid initially
        this.centerGrid();
        console.log('Grid centered');

        // Initialize visible cells
        const container = document.querySelector('.game-container');
        if (container && grid) {
            this.updateVisibleCells(container, grid);
            console.log('Initial visible cells updated');
        }
    },

    updateCell: function (x, y, state) {
        const key = `${x},${y}`;
        const previousState = {
            wasRevealed: MinesweeperDB.mines.revealed.has(key),
            hadMarker: MinesweeperDB.mines.markers.has(key),
            markerDetails: MinesweeperDB.mines.markers.get(key)
        };

        // States from server:
        // 0-8: Revealed cell with N adjacent mines
        // 9: Revealed mine
        // 10: Hidden cell
        // 11: Marked/flagged cell
        if (state >= 0 && state <= 8) { // Revealed cell with N adjacent mines
            MinesweeperDB.mines.revealed.add(key);
            MinesweeperDB.mines.markers.delete(key); // Remove any flags
            const cell = this.visibleCells.get(key);
            if (cell) {
                cell.className = 'grid-cell revealed';
                if (state === 0) {
                    cell.classList.add('empty');
                    cell.textContent = '';
                } else {
                    cell.classList.add(`adjacent-${state}`);
                    cell.textContent = state.toString();
                }
            }
        } else if (state === 9) { // BOMB
            MinesweeperDB.mines.revealed.add(key);
            MinesweeperDB.mines.markers.delete(key);
            const cell = this.visibleCells.get(key);
            if (cell) {
                cell.className = 'grid-cell revealed mine';
                cell.textContent = '💣';
            }
        } else if (state === 10) { // HIDDEN
            MinesweeperDB.mines.revealed.delete(key);
            MinesweeperDB.mines.markers.delete(key);
            const cell = this.visibleCells.get(key);
            if (cell) {
                cell.className = 'grid-cell';
                cell.textContent = '';
            }
        } else if (state === 11) { // MARKED
            MinesweeperDB.mines.revealed.delete(key);
            MinesweeperDB.mines.markers.set(key, {
                username: GameState.currentUser.username,
                avatar: '🚩'
            });
            const cell = this.visibleCells.get(key);
            if (cell) {
                cell.className = 'grid-cell';
                cell.textContent = '🚩';
            }
        }

        const newState = {
            isRevealed: MinesweeperDB.mines.revealed.has(key),
            hasMarker: MinesweeperDB.mines.markers.has(key),
            markerDetails: MinesweeperDB.mines.markers.get(key)
        };

    },

    createGrid: function () {
        // No longer need to create all cells upfront
        return '';
    },

    getPlayerDirection: function (playerX, playerY) {
        const container = document.querySelector('.game-container');
        if (!container) return 0;

        // Get current viewport center in grid coordinates
        const rect = container.getBoundingClientRect();
        const viewportCenterX = (-this.offsetX / this.zoom + rect.width / (2 * this.zoom)) / this.CELL_SIZE;
        const viewportCenterY = (-this.offsetY / this.zoom + rect.height / (2 * this.zoom)) / this.CELL_SIZE;

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

        // Convert grid coordinates to screen coordinates
        const screenX = this.offsetX + (x * this.CELL_SIZE * this.zoom) + (this.CURSOR_OFFSET_X * this.zoom);
        const screenY = this.offsetY + (y * this.CELL_SIZE * this.zoom) + (this.CURSOR_OFFSET_Y * this.zoom);

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

            // Center the grid based on top-left origin
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
        const logoutButton = document.querySelector('.logout-button');

        if (!container || !grid) {
            console.warn('Container or grid not found');
            return;
        }

        console.log('Setting up game handlers for container:', {
            containerSize: {
                width: container.clientWidth,
                height: container.clientHeight
            },
            gridSize: {
                width: grid.clientWidth,
                height: grid.clientHeight
            }
        });

        // Clear any existing animation frames when component unmounts
        window.addEventListener('beforeunload', () => {
            if (this.moveAnimationFrame) cancelAnimationFrame(this.moveAnimationFrame);
            if (this.zoomAnimationFrame) cancelAnimationFrame(this.zoomAnimationFrame);
        });

        // Initialize mouse position to center of container to prevent immediate scrolling
        const rect = container.getBoundingClientRect();
        this.lastX = rect.left + rect.width / 2;
        this.lastY = rect.top + rect.height / 2;
        this.isMouseInWindow = true;

        // Update edge scrolling to be framerate independent
        const updateEdgeScroll = (timestamp) => {
            if (!this.lastEdgeScrollTime) {
                this.lastEdgeScrollTime = timestamp;
                requestAnimationFrame(updateEdgeScroll);
                return;
            }

            const deltaTime = (timestamp - this.lastEdgeScrollTime) / 1000; // Convert to seconds
            this.lastEdgeScrollTime = timestamp;

            // Skip edge scrolling if keyboard movement is active
            if (!this.isMouseInWindow || this.pressedKeys.size > 0) {
                requestAnimationFrame(updateEdgeScroll);
                return;
            }

            const container = document.querySelector('.game-container');
            if (!container) {
                requestAnimationFrame(updateEdgeScroll);
                return;
            }

            const rect = container.getBoundingClientRect();
            const mouseX = this.lastX - rect.left;
            const mouseY = this.lastY - rect.top;

            let moved = false;
            const speed = this.EDGE_SCROLL_SPEED * deltaTime * this.zoom; // Multiply by zoom to make it zoom independent

            // Check if mouse is within vertical bounds
            const isInVerticalBounds = mouseY >= 0 && mouseY <= rect.height;
            // Check if mouse is within horizontal bounds
            const isInHorizontalBounds = mouseX >= 0 && mouseX <= rect.width;

            if (isInVerticalBounds) {
                if (mouseX < this.EDGE_SCROLL_THRESHOLD && mouseX >= 0) {
                    this.offsetX += speed;
                    moved = true;
                } else if (mouseX > rect.width - this.EDGE_SCROLL_THRESHOLD && mouseX <= rect.width) {
                    this.offsetX -= speed;
                    moved = true;
                }
            }

            if (isInHorizontalBounds) {
                if (mouseY < this.EDGE_SCROLL_THRESHOLD && mouseY >= 0) {
                    this.offsetY += speed;
                    moved = true;
                } else if (mouseY > rect.height - this.EDGE_SCROLL_THRESHOLD && mouseY <= rect.height) {
                    this.offsetY -= speed;
                    moved = true;
                }
            }

            if (moved) {
                this.clampOffset(container);
                this.updateGridTransform();
            }

            requestAnimationFrame(updateEdgeScroll);
        };

        // Start edge scrolling loop with timestamp
        requestAnimationFrame(updateEdgeScroll);

        // Track mouse position and window state
        window.addEventListener('mouseleave', () => {
            this.isMouseInWindow = false;
        });

        window.addEventListener('mouseenter', () => {
            this.isMouseInWindow = true;
        });

        // Track mouse position globally
        window.addEventListener('mousemove', (e) => {
            this.lastX = e.clientX;
            this.lastY = e.clientY;
        });

        // Cell click handling for revealing cells
        const handleCellClick = async (e) => {
            // Prevent cell interaction if we were just dragging
            if (this.isDragging) {
                console.log('Ignoring click due to drag');
                return;
            }

            const cell = e.target.closest('.grid-cell');
            if (!cell) {
                console.log('No cell found in click target');
                return;
            }

            const x = parseInt(cell.dataset.x);
            const y = parseInt(cell.dataset.y);
            const key = `${x},${y}`;

            console.log('🖱️ Left click on cell:', { x, y, key });

            const isServerMode = GameState.connection instanceof WebSocketGameConnection;
            console.log('Click mode:', isServerMode ? 'server' : 'local');

            // Check if cell has any flag
            const marker = MinesweeperDB.mines.markers.get(key);
            if (marker) {
                console.log('Cell has flag, ignoring click:', marker);
                return;
            }

            try {
                if (isServerMode) {
                    console.log('Sending open command to server:', { x, y });
                    const response = await GameState.connection.openCell(x, y);
                    console.log('Server response to open:', response);
                } else {
                    console.log('Processing local cell open');
                    await MinesweeperDB.revealCell(x, y, GameState.currentUser.username);
                    await this.renderMinesweeperState();
                }
            } catch (error) {
                console.error('Failed to process cell click:', error);
            }
        };

        // Cell right click handling for flags
        const handleCellRightClick = async (e) => {
            e.preventDefault();

            // Prevent cell interaction if we were just dragging
            if (this.isDragging) {
                console.log('Ignoring right click due to drag');
                return;
            }

            const cell = e.target.closest('.grid-cell');
            if (!cell) {
                console.log('No cell found in right click target');
                return;
            }

            const x = parseInt(cell.dataset.x);
            const y = parseInt(cell.dataset.y);
            const key = `${x},${y}`;

            console.log('🖱️ Right click on cell:', { x, y, key });

            const isServerMode = GameState.connection instanceof WebSocketGameConnection;
            console.log('Click mode:', isServerMode ? 'server' : 'local');

            try {
                if (isServerMode) {
                    console.log('Sending mark command to server:', { x, y });
                    const response = await GameState.connection.markCell(x, y);
                    console.log('Server response to mark:', response);
                } else {
                    // Check if cell has any flag
                    const marker = MinesweeperDB.mines.markers.get(key);
                    if (marker) {
                        console.log('Removing flag:', marker);
                        await MinesweeperDB.toggleMarker(x, y, marker.username, marker.avatar);
                    } else {
                        console.log('Adding flag');
                        await MinesweeperDB.setMarker(x, y, GameState.currentUser.username, GameState.currentUser.avatar);
                    }
                    await this.renderMinesweeperState();
                }
            } catch (error) {
                console.error('Failed to process right click:', error);
            }
        };

        console.log('Attaching click handlers to grid');
        grid.addEventListener('click', handleCellClick);
        grid.addEventListener('contextmenu', handleCellRightClick);

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
        if (settingsToggle && settingsDropdown) {
            settingsToggle.addEventListener('click', (e) => {
                e.stopPropagation();
                settingsDropdown.classList.toggle('hidden');
            });
        }

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!settingsDropdown?.contains(e.target) && !settingsToggle?.contains(e.target)) {
                settingsDropdown?.classList.add('hidden');
            }
        });

        // Logout button
        if (logoutButton) {
            logoutButton.addEventListener('click', (e) => {
                e.stopPropagation();
                window.location.hash = '#login';
                settingsDropdown?.classList.add('hidden');
            });
        }

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

        // Update keyboard movement to be framerate independent
        const updateMovement = (timestamp) => {
            if (!this.lastMovementTime) {
                this.lastMovementTime = timestamp;
                if (this.pressedKeys.size > 0) {
                    this.moveAnimationFrame = requestAnimationFrame(updateMovement);
                }
                return;
            }

            // Cap deltaTime to prevent large jumps (max 32ms = ~30fps)
            const deltaTime = Math.min((timestamp - this.lastMovementTime) / 1000, 0.032);
            this.lastMovementTime = timestamp;

            if (this.pressedKeys.size > 0) {
                // Calculate movement vector
                let dx = 0;
                let dy = 0;

                if (this.pressedKeys.has('w') || this.pressedKeys.has('arrowup')) dy += 1;
                if (this.pressedKeys.has('s') || this.pressedKeys.has('arrowdown')) dy -= 1;
                if (this.pressedKeys.has('a') || this.pressedKeys.has('arrowleft')) dx += 1;
                if (this.pressedKeys.has('d') || this.pressedKeys.has('arrowright')) dx -= 1;

                // Normalize diagonal movement
                if (dx !== 0 && dy !== 0) {
                    const length = Math.sqrt(dx * dx + dy * dy);
                    dx /= length;
                    dy /= length;
                }

                // Calculate base speed with zoom compensation
                const baseSpeed = this.BASE_MOVE_SPEED * deltaTime * this.zoom;
                // Cap maximum speed per frame (100 pixels)
                const maxSpeed = 100;
                const speed = Math.min(baseSpeed, maxSpeed);

                // Apply movement
                this.offsetX += dx * speed;
                this.offsetY += dy * speed;

                const container = document.querySelector('.game-container');
                if (container) {
                    this.clampOffset(container);
                    this.updateGridTransform();
                }

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
    },

    startUpdates: function () {
        // Clear any existing interval
        this.stopUpdates();

        const isServerMode = GameState.connection instanceof WebSocketGameConnection;

        // Start periodic updates for game state
        this.updateInterval = setInterval(async () => {
            try {
                if (!isServerMode) {
                    // Only load from mock DB in local mode
                    await Promise.all([
                        MockDB.loadPlayers(), // Refresh player data
                        MinesweeperDB.loadMines() // Refresh mines data
                    ]);
                    // Cache the player data for marker updates
                    this.cachedPlayerData = await MockDB.getOnlinePlayers();
                    // Only update game state here, markers are updated separately
                    await this.renderMinesweeperState();
                }
                // In server mode, updates come through WebSocket events
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
        const bounds = {
            left: Math.max(0, left),
            top: Math.max(0, top),
            right: Math.min(MinesweeperDB.gridWidth, right),
            bottom: Math.min(MinesweeperDB.gridHeight, bottom)
        };

        // Only send view update if it changed
        if (GameState.connection instanceof WebSocketGameConnection) {
            const viewStr = `${bounds.left},${bounds.top},${bounds.right},${bounds.bottom}`;
            if (viewStr !== this.currentView) {
                this.currentView = viewStr;
                GameState.connection.ws.send(`view ${bounds.left} ${bounds.top} ${bounds.right} ${bounds.bottom}`);
            }
        }

        return bounds;
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
                // Skip if outside grid boundaries
                if (x >= MinesweeperDB.gridWidth || y >= MinesweeperDB.gridHeight) continue;

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
        // Ensure mines data structure exists
        if (!MinesweeperDB.mines) {
            console.warn('Mines data structure not initialized');
            return;
        }

        const isServerMode = GameState.connection instanceof WebSocketGameConnection;
        const updates = [];

        for (const [key, cell] of this.visibleCells.entries()) {
            const [x, y] = key.split(',').map(Number);
            const update = { cell, classes: ['grid-cell'], html: '', color: '' };

            if (MinesweeperDB.mines.revealed.has(key)) {
                update.classes.push('revealed');
                // In server mode, we rely on the state sent from server
                // The state is already set in updateCell, so we just need to preserve it
                if (cell.classList.contains('empty')) {
                    update.classes.push('empty');
                } else if (cell.classList.contains('mine')) {
                    update.classes.push('mine');
                    update.html = '💣';
                } else {
                    // For numbered cells, preserve the number and its class
                    for (let i = 1; i <= 8; i++) {
                        if (cell.classList.contains(`adjacent-${i}`)) {
                            update.classes.push(`adjacent-${i}`);
                            update.html = i.toString();
                            break;
                        }
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

        // Apply all updates directly
        updates.forEach(update => {
            update.cell.className = update.classes.join(' ');
            update.cell.innerHTML = update.html;
            update.cell.style.color = update.color;
        });
    },

    // Create a cell element
    createCell: function (x, y) {
        const cell = document.createElement('div');
        cell.className = 'grid-cell';
        cell.dataset.x = x;
        cell.dataset.y = y;

        // Use grid coordinates directly, with 0/0 at top-left
        cell.style.gridColumn = x + 1; // +1 because CSS grid is 1-based
        cell.style.gridRow = y + 1;
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

        // Get current viewport center in grid coordinates
        const rect = container.getBoundingClientRect();
        const gridCenterX = Math.floor(MinesweeperDB.gridWidth / 2);
        const gridCenterY = Math.floor(MinesweeperDB.gridHeight / 2);
        const viewportCenterX = (-this.offsetX / this.zoom + rect.width / (2 * this.zoom)) / this.CELL_SIZE - gridCenterX;
        const viewportCenterY = (-this.offsetY / this.zoom + rect.height / (2 * this.zoom)) / this.CELL_SIZE - gridCenterY;

        // Create and position indicators/cursors for each player
        players.forEach(player => {
            if (player.username === GameState.currentUser.username) return;

            // Get simulated position if available, otherwise use static position
            const movement = this.playerMovements.get(player.username);
            const x = movement ? movement.currentX : player.position.x;
            const y = movement ? movement.currentY : player.position.y;

            // Calculate distance from viewport center
            const dx = x - viewportCenterX;
            const dy = y - viewportCenterY;
            const distance = Math.hypot(dx, dy);

            // Calculate opacity based on distance (fade out between 50 and 100 tiles)
            const opacity = distance >= 100 ? 0 :
                distance <= 50 ? 1 :
                    (100 - distance) / 50;

            // Skip rendering if completely invisible
            if (opacity === 0) return;

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
                cursor.style.opacity = opacity;

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
                indicator.style.opacity = opacity;

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