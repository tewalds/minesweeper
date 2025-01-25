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
                const indicator = document.createElement('div');
                indicator.className = 'player-indicator';
                indicator.innerHTML = `
                    <div class="indicator-content" style="color: ${player.color}">
                        <span class="indicator-arrow">${this.getDirectionArrow(direction)}</span>
                        <span class="indicator-avatar">${player.avatar}</span>
                        <span class="indicator-name">${player.username}</span>
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
    }
}; 