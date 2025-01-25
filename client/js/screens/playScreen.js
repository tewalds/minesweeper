const PlayScreen = {
    GRID_SIZE: 30, // 30x30 grid
    CELL_SIZE: 25, // pixels

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
                    </div>
                    <div class="settings-menu">
                        <button class="header-button settings-toggle">⚙️ Menu</button>
                        <div class="settings-dropdown hidden">
                            <button class="logout-button">Logout</button>
                        </div>
                    </div>
                </div>
                <div class="game-grid" style="
                    width: ${this.GRID_SIZE * this.CELL_SIZE}px; 
                    height: ${this.GRID_SIZE * this.CELL_SIZE}px;
                ">
                    ${this.createGrid()}
                </div>
            </div>
        `;
        container.innerHTML = html;
        await this.renderPlayers();
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

    renderPlayers: async function () {
        const gridOffsetX = Math.floor(this.GRID_SIZE / 2);
        const gridOffsetY = Math.floor(this.GRID_SIZE / 2);

        // Calculate grid boundaries in world coordinates
        const minX = GameState.currentUser.x - gridOffsetX;
        const maxX = GameState.currentUser.x + gridOffsetX;
        const minY = GameState.currentUser.y - gridOffsetY;
        const maxY = GameState.currentUser.y + gridOffsetY;

        // Place current player in center
        const centerCell = document.querySelector(`.grid-cell[data-x="${gridOffsetX}"][data-y="${gridOffsetY}"]`);
        if (centerCell) {
            centerCell.innerHTML = `
                <div class="player current-player" style="color: ${GameState.currentUser.color}; background-color: ${GameState.currentUser.color}20">
                    ${GameState.currentUser.avatar}
                </div>
            `;
        }

        // Place other players if they're within view
        const onlinePlayers = await MockDB.getOnlinePlayers();
        onlinePlayers.forEach(player => {
            if (player.username === GameState.currentUser.username) return; // Skip current player

            const { x, y } = player.position;
            if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
                // Convert world coordinates to grid coordinates
                const gridX = gridOffsetX + (x - GameState.currentUser.x);
                const gridY = gridOffsetY + (y - GameState.currentUser.y);

                const cell = document.querySelector(`.grid-cell[data-x="${gridX}"][data-y="${gridY}"]`);
                if (cell) {
                    cell.innerHTML = `
                        <div class="player" style="color: ${player.color}; background-color: ${player.color}20">
                            ${player.avatar}
                        </div>
                    `;
                }
            }
        });
    }
}; 