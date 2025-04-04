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
    RENDER_MARGIN: 5, // Extra cells to render beyond viewport
    CELL_POOL_SIZE: 2500, // Pool of reusable cells (50x50 visible area)

    // Cursor offset for indicators and arrows (at 100% zoom)
    CURSOR_OFFSET_X: 20, // Half cell width
    CURSOR_OFFSET_Y: 30, // Half cell height

    // Track the current view for efficient updates
    currentView: null,

    // Track grid dimensions
    gridInfo: null,  // A Rect object.

    // Track revealed cells and markers
    revealed: new Set(),  // "x,y"
    markers: new Map(),  // "x,y" -> userId

    // Update cell state
    updateCell: function (x, y, state, userId) {
        const key = `${x},${y}`;

        if (state >= 0 && state <= 8) { // Revealed cell
            this.revealed.add(key);
            this.markers.delete(key); // Remove any flags
            const cell = this.visibleCells.get(key);
            if (cell) {
                cell.classList.add('revealed');
                if (state === 0) {
                    cell.classList.add('empty');
                    cell.textContent = '';
                } else {
                    cell.classList.add(`adjacent-${state}`);
                    cell.textContent = state.toString();
                }
            }
        } else if (state === 9) { // BOMB
            this.revealed.add(key);
            this.markers.delete(key);
            const cell = this.visibleCells.get(key);
            if (cell) {
                cell.classList.add('revealed', 'mine');
                cell.textContent = '💣';
            }
        } else if (state === 10) { // HIDDEN
            this.revealed.delete(key);
            this.markers.delete(key);
            const cell = this.visibleCells.get(key);
            if (cell) {
                cell.textContent = '';
                cell.style.color = ''; // Clear any color
            }
        } else if (state === 11) { // MARKED
            this.revealed.delete(key);
            this.markers.set(key, userId);
            const cell = this.visibleCells.get(key);
            if (cell) {
                // Update visual state immediately
                this.updateCellMarker(cell, key);
            }
        }
    },

    // Update game state
    updateGameState: function () {
        // Update visible cells
        const grid = document.querySelector('.game-grid');
        const container = document.querySelector('.game-container');
        if (grid && container) {
            this.updateVisibleCells(container, grid);
        }

        // Update score display
        const scoreElement = document.querySelector('.player-score');
        if (scoreElement) {
            scoreElement.textContent = `Score: ${GameState.currentUser().score}`;
        }
    },

    updateInterval: null,
    cursorUpdateFrame: null,
    lastMarkerUpdate: 0,
    isDragging: false,
    lastMousePos: new Point(0, 0),
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
        const gridWidth = this.gridInfo.width * this.CELL_SIZE;
        const gridHeight = this.gridInfo.height * this.CELL_SIZE;

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

        const gridCenterX = Math.floor(this.gridInfo.width / 2);
        const gridCenterY = Math.floor(this.gridInfo.height / 2);

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

        const gridWidth = this.gridInfo.width * this.CELL_SIZE * this.zoom;
        const gridHeight = this.gridInfo.height * this.CELL_SIZE * this.zoom;
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

    show: async function (container, point) {
        console.log('PlayScreen.show() - Starting initialization');

        // Get grid info from server
        this.gridInfo = GameState.connection.getGridInfo();
        if (!this.gridInfo) {
            console.error('No grid info available');
            alert('Failed to get grid information. Please try again.');
            return;
        }

        const html = `
            <div class="play-screen">
                <div class="player-info-container">
                    <div class="player-info">
                        <span style="color: ${GameState.currentUser().color}">${GameState.currentUser().avatar}</span>
                        <span>${GameState.currentUser().name}</span>
                        <span class="player-score">Score: ${GameState.currentUser().score}</span>
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

        // Debug: Check if containers exist
        const indicatorsContainer = document.querySelector('.player-indicators');
        const cursorsContainer = document.querySelector('.player-cursors');
        console.log('Containers:', {
            indicators: indicatorsContainer,
            cursors: cursorsContainer,
            styles: {
                indicators: indicatorsContainer?.getBoundingClientRect(),
                cursors: cursorsContainer?.getBoundingClientRect()
            }
        });

        // Initialize game grid
        this.centerOnPosition(point.x, point.y);
        await this.initializeGrid();
        console.log('PlayScreen - Grid initialized');

        this.attachGameHandlers();
        console.log('PlayScreen - Game handlers attached');

        // Start update loops
        this.startUpdates();
        this.startCursorUpdates();
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

        // Initialize the grid container
        const grid = document.querySelector('.game-grid');
        if (grid) {
            // Set up grid CSS properties
            grid.style.display = 'grid';
            grid.style.width = `${this.gridInfo.width * this.CELL_SIZE}px`;
            grid.style.height = `${this.gridInfo.height * this.CELL_SIZE}px`;
            grid.style.gridTemplateColumns = `repeat(${this.gridInfo.width}, ${this.CELL_SIZE}px)`;
            grid.style.gridTemplateRows = `repeat(${this.gridInfo.height}, ${this.CELL_SIZE}px)`;
            grid.style.position = 'relative';
            grid.style.transformOrigin = 'top left';
            grid.style.setProperty('--cell-size', `${this.CELL_SIZE}px`);
            console.log('Grid container initialized with cell size:', this.CELL_SIZE);
        }


        // Initialize visible cells
        const container = document.querySelector('.game-container');
        if (container && grid) {
            this.updateVisibleCells(container, grid);
            console.log('Initial visible cells updated');
        }
    },

    getPlayerDirection: function (playerX, playerY) {
        const container = document.querySelector('.game-container');
        if (!container) return 0;

        // Get current viewport center in grid coordinates
        const rect = Rect.fromRect(container.getBoundingClientRect());
        const viewportCenterX = (-this.offsetX / this.zoom + rect.width / (2 * this.zoom)) / this.CELL_SIZE;
        const viewportCenterY = (-this.offsetY / this.zoom + rect.height / (2 * this.zoom)) / this.CELL_SIZE;

        // Calculate direction from viewport center to player
        const dx = playerX - viewportCenterX;
        const dy = playerY - viewportCenterY;

        return Math.atan2(dy, dx);
    },

    // Calculate if a player is visible in the current viewport
    isPlayerVisible: function (x, y, container) {
        if (!container) return false;

        const bounds = this.getVisibleBounds(container);
        if (!bounds) return false;

        // Add a small margin to the bounds
        const margin = 2;
        // x and y are already relative to grid center, so we need to add center back
        const gridCenterX = Math.floor(this.gridInfo.width / 2);
        const gridCenterY = Math.floor(this.gridInfo.height / 2);
        const absX = x + gridCenterX;
        const absY = y + gridCenterY;

        return absX >= bounds.left - margin &&
            absX <= bounds.right + margin &&
            absY >= bounds.top - margin &&
            absY <= bounds.bottom + margin;
    },

    // Calculate screen position for a player
    calculatePlayerScreenPosition: function (x, y, container) {
        if (!container) return null;

        const rect = Rect.fromRect(container.getBoundingClientRect());
        const gridCenterX = Math.floor(this.gridInfo.width / 2);
        const gridCenterY = Math.floor(this.gridInfo.height / 2);
        const absX = x + gridCenterX;
        const absY = y + gridCenterY;

        // Convert grid coordinates to screen coordinates
        const screenX = this.offsetX + (absX * this.CELL_SIZE * this.zoom) + (this.CURSOR_OFFSET_X * this.zoom);
        const screenY = this.offsetY + (absY * this.CELL_SIZE * this.zoom) + (this.CURSOR_OFFSET_Y * this.zoom);

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

    renderMinesweeperState: async function () {
        const grid = document.querySelector('.game-grid');
        const container = document.querySelector('.game-container');
        if (!grid || !container) return;

        // Update visible cells
        this.updateVisibleCells(container, grid);

        // Update score
        const scoreElement = document.querySelector('.player-score');
        if (scoreElement) {
            scoreElement.textContent = `Score: ${GameState.currentUser().score}`;
        }
    },

    centerGrid: function () {
        const gameContainer = document.querySelector('.game-container');
        const grid = document.querySelector('.game-grid');
        if (gameContainer && grid) {
            const gridWidth = this.gridInfo.width * this.CELL_SIZE;
            const gridHeight = this.gridInfo.height * this.CELL_SIZE;

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
        this.lastMousePos = Rect.fromRect(container.getBoundingClientRect()).center;
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

            const rect = Rect.fromRect(container.getBoundingClientRect());
            const mouse = this.lastMousePos.sub(rect.tl);

            let moved = false;
            const speed = this.EDGE_SCROLL_SPEED * deltaTime * this.zoom; // Multiply by zoom to make it zoom independent

            if (mouse.y >= 0 && mouse.y <= rect.height) {
                if (mouse.x < this.EDGE_SCROLL_THRESHOLD && mouse.x >= 0) {
                    this.offsetX += speed;
                    moved = true;
                } else if (mouse.x > rect.width - this.EDGE_SCROLL_THRESHOLD && mouse.x <= rect.width) {
                    this.offsetX -= speed;
                    moved = true;
                }
            }

            if (mouse.x >= 0 && mouse.x <= rect.width) {
                if (mouse.y < this.EDGE_SCROLL_THRESHOLD && mouse.y >= 0) {
                    this.offsetY += speed;
                    moved = true;
                } else if (mouse.y > rect.height - this.EDGE_SCROLL_THRESHOLD && mouse.y <= rect.height) {
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

        // Cell click handling
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

            console.log('🖱️ Left click on cell:', { x, y });

            try {
                console.log('Sending open command to server:', { x, y });
                await GameState.connection.openCell(x, y);
            } catch (error) {
                console.error('Failed to process cell click:', error);
            }
        };

        // Cell right click handling
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

            console.log('🖱️ Right click on cell:', { x, y });

            try {
                // If cell has any flag, unmark it, otherwise mark it
                if (this.markers.has(key)) {
                    console.log('Sending unmark command to server:', { x, y });
                    await GameState.connection.unmarkCell(x, y);
                } else {
                    console.log('Sending mark command to server:', { x, y });
                    await GameState.connection.markCell(x, y);
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
                    const rect = Rect.fromRect(container.getBoundingClientRect());
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
            // TODO: clampOffset
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
                GameState.disconnect();
                App.showScreen(App.screens.LOGIN);
            });
        }

        // Mouse drag handling
        container.addEventListener('mousedown', (e) => {
            if (e.button === 1) { // Middle mouse button only
                e.preventDefault(); // Prevent default middle-click behavior
                this.isDragging = true;
                this.lastMousePos = new Point(e.clientX, e.clientY);
                container.classList.add('grabbing');
            }
        });

        window.addEventListener('mousemove', (e) => {
            if (this.isDragging) {
                this.offsetX += e.clientX - this.lastMousePos.x;
                this.offsetY += e.clientY - this.lastMousePos.y;
                this.lastMousePos = new Point(e.clientX, e.clientY);

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
                const rect = Rect.fromRect(container.getBoundingClientRect());

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
            if ('=+-_'.includes(key) && this.activeZoom === null) {
                e.preventDefault(); // Prevent browser zoom
                this.activeZoom = '=+'.includes(key) ? 1 : -1;
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
            if ('=+-_'.includes(key) && ('=+'.includes(key) ? 1 : -1) === this.activeZoom) {
                this.activeZoom = null;
                if (this.zoomAnimationFrame) {
                    cancelAnimationFrame(this.zoomAnimationFrame);
                    this.zoomAnimationFrame = null;
                }
            }
        });
    },

    startCursorUpdates: function () {
        const updateCursors = async (timestamp) => {
            // Check if enough time has passed since last update
            if (timestamp - this.lastMarkerUpdate >= this.MARKER_UPDATE_INTERVAL) {
                this.lastMarkerUpdate = timestamp;
                // Use GameState.players directly instead of cached data
                await this.renderPlayerCursors();
            }

            this.cursorUpdateFrame = requestAnimationFrame(updateCursors);
        };

        this.cursorUpdateFrame = requestAnimationFrame(updateCursors);
    },

    startUpdates: function () {
        // Update game state periodically
        this.updateInterval = setInterval(() => {
            this.updateGameState();
        }, this.UPDATE_INTERVAL);
    },

    stopUpdates: function () {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
        if (this.cursorUpdateFrame) {
            cancelAnimationFrame(this.cursorUpdateFrame);
            this.cursorUpdateFrame = null;
        }
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

        const rect = Rect.fromRect(container.getBoundingClientRect());
        const scale = 1 / this.zoom;

        // Convert screen coordinates to grid coordinates
        let bounds = new Rect(
            new Point(
                Math.floor((rect.left - this.offsetX) * scale / this.CELL_SIZE) - this.RENDER_MARGIN,
                Math.floor((rect.top - this.offsetY) * scale / this.CELL_SIZE) - this.RENDER_MARGIN),
            new Point(
                Math.ceil((rect.right - this.offsetX) * scale / this.CELL_SIZE) + this.RENDER_MARGIN,
                Math.ceil((rect.bottom - this.offsetY) * scale / this.CELL_SIZE) + this.RENDER_MARGIN));

        bounds = this.gridInfo.intersection(bounds);

        // Only send view update if it changed
        if (!this.currentView || !Rect.equals(bounds, this.currentView)) {
            this.currentView = bounds;
            GameState.connection.sendView(bounds.left, bounds.top, bounds.right, bounds.bottom, false);
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

        const cellsToRemove = new Set(this.visibleCells.keys());
        const fragment = document.createDocumentFragment();

        // Update or create visible cells
        for (let y = bounds.top; y < bounds.bottom; y++) {
            for (let x = bounds.left; x < bounds.right; x++) {
                // Skip if outside grid boundaries
                if (x >= this.gridInfo.width || y >= this.gridInfo.height) continue;

                const key = `${x},${y}`;
                cellsToRemove.delete(key);

                if (!this.visibleCells.has(key)) {
                    const cell = this.createCell(x, y);
                    fragment.appendChild(cell);
                    this.visibleCells.set(key, cell);
                }
            }
        }

        // Remove out-of-view cells
        for (const key of cellsToRemove) {
            const cell = this.visibleCells.get(key);
            this.recycleCellElement(cell);
            this.visibleCells.delete(key);
        }

        // Batch DOM updates
        if (fragment.children.length > 0) {
            grid.appendChild(fragment);
        }

        // Always update states after changing visible cells
        this.updateVisibleCellStates();
    },

    // Update the states of visible cells
    updateVisibleCellStates: function () {
        for (const [key, cell] of this.visibleCells.entries()) {
            if (this.revealed.has(key)) {
                continue; // Skip revealed cells - they're handled in updateCell
            }

            // Update marker if present
            this.updateCellMarker(cell, key);
        }
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
    renderPlayerCursors: async function () {
        const indicatorsContainer = document.querySelector('.player-indicators');
        const cursorsContainer = document.querySelector('.player-cursors');
        const container = document.querySelector('.game-container');

        if (!indicatorsContainer || !cursorsContainer || !container) {
            return;
        }

        // Debug: Log current players
        // console.log('Current players:', [...GameState.players.entries()]);

        indicatorsContainer.innerHTML = '';
        cursorsContainer.innerHTML = '';

        // Calculate grid center offset
        const gridCenterX = Math.floor(this.gridInfo.width / 2);
        const gridCenterY = Math.floor(this.gridInfo.height / 2);

        // Process each player from GameState
        for (const [userId, playerData] of GameState.players.entries()) {
            // Skip current user and inactive players (no mouse data)
            if (userId === GameState.userid || (playerData.mouse.x == 0 && playerData.mouse.y == 0)) {
                continue;
            }

            // Calculate player position - prefer mouse position if available
            // Adjust coordinates to be relative to grid center
            const x = playerData.mouse.x;
            const y = playerData.mouse.y;

            // Check if player is visible in current viewport
            const isVisible = this.isPlayerVisible(x, y, container);
            const screenPos = this.calculatePlayerScreenPosition(x, y, container);

            if (isVisible && screenPos) {
                // Player is visible on screen, show cursor
                const cursor = document.createElement('div');
                cursor.className = 'player-cursor';
                cursor.style.left = `${screenPos.x}px`;
                cursor.style.top = `${screenPos.y}px`;
                cursor.style.color = playerData.color;

                cursor.innerHTML = `
                    <div class="cursor-pointer"></div>
                    <div class="cursor-info">
                        <span class="cursor-avatar">${playerData.avatar}</span>
                        <span class="cursor-name">${playerData.name}</span>
                        <span class="cursor-score">${playerData.score}</span>
                    </div>
                `;

                cursorsContainer.appendChild(cursor);
            } else {
                // Player is off screen, show edge indicator
                const angle = this.getPlayerDirection(x, y);
                const arrow = this.getDirectionArrow(angle);
                const edgePos = this.calculateEdgePosition(angle, container);

                const indicator = document.createElement('div');
                indicator.className = 'player-indicator';
                indicator.style.color = playerData.color;
                indicator.style.left = `${edgePos.x}px`;
                indicator.style.top = `${edgePos.y}px`;
                indicator.style.transform = `rotate(${edgePos.angle}rad)`;

                indicator.innerHTML = `
                    <span class="indicator-arrow">${arrow}</span>
                    <span class="indicator-avatar">${playerData.avatar}</span>
                    <span class="indicator-name">${playerData.name}</span>
                    <span class="indicator-score">${playerData.score}</span>
                `;

                indicatorsContainer.appendChild(indicator);
            }
        }
    },

    processUpdate: function (state, x, y, userId) {
        // Store the state before updating
        key = x + ',' + y;
        const oldState = this.revealed.has(key);

        // Update the cell - now passing userId
        this.updateCell(x, y, state, userId);

        // Force a visual update only if state changed
        if (oldState !== this.revealed.has(key)) {
            const grid = document.querySelector('.game-grid');
            const container = document.querySelector('.game-container');
            if (grid && container) {
                this.updateVisibleCells(container, grid);
                this.updateVisibleCellStates();
            }
        }
    },

    // Add new helper method to update cell marker visuals
    updateCellMarker: function (cell, key) {
        const marker = this.markers.get(key);
        if (!marker) {
            // No marker, clear the cell
            cell.textContent = '';
            cell.style.color = '';
            return;
        }

        // Find player data for this marker
        const playerData = GameState.players.get(marker);
        if (!playerData) {
            // If we don't have player data, clear the marker
            this.markers.delete(key);
            cell.textContent = '';
            cell.style.color = '';
            return;
        }

        // Render the player's avatar in their color
        cell.textContent = playerData.avatar;
        cell.style.color = playerData.color;
    }
}; 