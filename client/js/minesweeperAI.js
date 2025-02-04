const MinesweeperAI = {
    // Constants
    VISION_RANGE: 20, // How many cells a player can "see" in each direction
    SOLVED_AREA_CHECK_RADIUS: 8, // Radius to check for determining if an area is solved

    // Knowledge base for each player
    playerKnowledge: new Map(),

    // Initialize knowledge base for a player
    initPlayerKnowledge: function (username) {
        // Try to get player's current position from MockDB
        let currentX = 0;
        let currentY = 0;

        const player = MockDB.players[`player_${username}`];
        if (player && player.position) {
            currentX = player.position.x;
            currentY = player.position.y;
        }

        this.playerKnowledge.set(username, {
            knownSafe: new Set(),  // Cells we know are safe
            flagged: new Set(),    // Cells we've flagged as mines
            frontier: new Set(),    // Unrevealed cells adjacent to revealed ones
            revealed: new Set(),    // Cells we've revealed
            lastAnalysis: null,     // Cache of our last analysis
            currentX: currentX,     // Current position
            currentY: currentY,
            lastActionTime: 0       // Last time this player took an action
        });
    },

    // Get or create knowledge base for a player
    getKnowledge: function (username) {
        if (!this.playerKnowledge.has(username)) {
            this.initPlayerKnowledge(username);
        }
        return this.playerKnowledge.get(username);
    },

    // Update player position
    updatePosition: function (username, x, y) {
        const knowledge = this.getKnowledge(username);
        knowledge.currentX = x;
        knowledge.currentY = y;
    },

    // Check if a cell is within vision range
    isInVisionRange: function (x, y, playerX, playerY) {
        return Math.abs(x - playerX) <= this.VISION_RANGE &&
            Math.abs(y - playerY) <= this.VISION_RANGE;
    },

    // Update knowledge when a cell is revealed
    updateKnowledge: function (username, x, y, adjacentMines) {
        const knowledge = this.getKnowledge(username);
        const key = `${x},${y}`;

        // Only update knowledge if within vision range
        if (!this.isInVisionRange(x, y, knowledge.currentX, knowledge.currentY)) {
            return;
        }

        // Update our sets
        knowledge.revealed.add(key);
        knowledge.frontier.delete(key);
        knowledge.knownSafe.delete(key);

        // Add unrevealed neighbors to frontier
        this.getNeighbors(x, y, knowledge.currentX, knowledge.currentY).forEach(neighbor => {
            const neighborKey = `${neighbor.x},${neighbor.y}`;
            if (!knowledge.revealed.has(neighborKey) &&
                !knowledge.flagged.has(neighborKey) &&
                this.isInVisionRange(neighbor.x, neighbor.y, knowledge.currentX, knowledge.currentY)) {
                knowledge.frontier.add(neighborKey);
            }
        });

        // Clear analysis cache since board changed
        knowledge.lastAnalysis = null;
        knowledge.lastActionTime = Date.now();
    },

    // Update knowledge when a cell is flagged
    updateFlag: function (username, x, y, isFlagging) {
        const knowledge = this.getKnowledge(username);
        const key = `${x},${y}`;

        // Only update knowledge if within vision range
        if (!this.isInVisionRange(x, y, knowledge.currentX, knowledge.currentY)) {
            return;
        }

        if (isFlagging) {
            knowledge.flagged.add(key);
            knowledge.frontier.delete(key);
            knowledge.knownSafe.delete(key);
        } else {
            knowledge.flagged.delete(key);
            // Add back to frontier if adjacent to revealed cell
            if (this.isAdjacentToRevealed(x, y, knowledge.revealed)) {
                knowledge.frontier.add(key);
            }
        }

        // Clear analysis cache
        knowledge.lastAnalysis = null;
        knowledge.lastActionTime = Date.now();
    },

    // Get all valid neighboring cells within vision range
    getNeighbors: function (x, y, playerX, playerY) {
        const neighbors = [];
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (dx === 0 && dy === 0) continue;
                const newX = x + dx;
                const newY = y + dy;
                if (MinesweeperDB.isValidPosition(newX, newY) &&
                    (!playerX || this.isInVisionRange(newX, newY, playerX, playerY))) {
                    neighbors.push({ x: newX, y: newY });
                }
            }
        }
        return neighbors;
    },

    // Check if a cell is adjacent to any revealed cell
    isAdjacentToRevealed: function (x, y, revealed) {
        return this.getNeighbors(x, y).some(neighbor =>
            revealed.has(`${neighbor.x},${neighbor.y}`)
        );
    },

    // Analyze current board state for a player
    analyzeBoard: function (username) {
        const knowledge = this.getKnowledge(username);

        // Use cached analysis if available
        if (knowledge.lastAnalysis) return knowledge.lastAnalysis;

        const safeMoves = new Set();
        const mineMoves = new Set();

        // Check each revealed cell for definite conclusions
        knowledge.revealed.forEach(key => {
            const [x, y] = key.split(',').map(Number);

            // Skip if out of vision range
            if (!this.isInVisionRange(x, y, knowledge.currentX, knowledge.currentY)) {
                return;
            }

            const adjacentMines = MinesweeperDB.getAdjacentMines(x, y);

            // Get unrevealed neighbors
            const neighbors = this.getNeighbors(x, y, knowledge.currentX, knowledge.currentY);
            const unrevealedNeighbors = neighbors.filter(n => {
                const nKey = `${n.x},${n.y}`;
                return !knowledge.revealed.has(nKey);
            });

            // Count flagged neighbors
            const flaggedCount = neighbors.filter(n =>
                knowledge.flagged.has(`${n.x},${n.y}`)
            ).length;

            // If we've found all mines around this cell, remaining cells are safe
            if (flaggedCount === adjacentMines) {
                unrevealedNeighbors.forEach(n => {
                    const nKey = `${n.x},${n.y}`;
                    if (!knowledge.flagged.has(nKey)) {
                        safeMoves.add(nKey);
                    }
                });
            }

            // If remaining hidden cells must all be mines, flag them
            const hiddenCount = unrevealedNeighbors.length - flaggedCount;
            if (hiddenCount === adjacentMines - flaggedCount) {
                unrevealedNeighbors.forEach(n => {
                    const nKey = `${n.x},${n.y}`;
                    if (!knowledge.flagged.has(nKey)) {
                        mineMoves.add(nKey);
                    }
                });
            }
        });

        // Cache the analysis
        knowledge.lastAnalysis = { safeMoves, mineMoves };
        return { safeMoves, mineMoves };
    },

    // Check if current area is "solved" (all safe cells revealed and all mines flagged)
    isAreaSolved: function (username) {
        const knowledge = this.getKnowledge(username);
        const radius = this.SOLVED_AREA_CHECK_RADIUS;
        let hasUnrevealedSafeCells = false;

        // Check all cells in current area
        for (let dx = -radius; dx <= radius; dx++) {
            for (let dy = -radius; dy <= radius; dy++) {
                const x = knowledge.currentX + dx;
                const y = knowledge.currentY + dy;
                if (!MinesweeperDB.isValidPosition(x, y)) continue;

                const key = `${x},${y}`;
                // Skip if we've revealed or flagged this cell
                if (knowledge.revealed.has(key) || knowledge.flagged.has(key)) continue;

                // For each unrevealed cell, check if it's adjacent to any revealed number
                const neighbors = this.getNeighbors(x, y, knowledge.currentX, knowledge.currentY);
                for (const neighbor of neighbors) {
                    const neighborKey = `${neighbor.x},${neighbor.y}`;
                    if (knowledge.revealed.has(neighborKey)) {
                        const adjacentMines = MinesweeperDB.getAdjacentMines(neighbor.x, neighbor.y);
                        if (adjacentMines > 0) {
                            // This cell is next to a number, might be important
                            hasUnrevealedSafeCells = true;
                            break;
                        }
                    }
                }
                if (hasUnrevealedSafeCells) break;
            }
            if (hasUnrevealedSafeCells) break;
        }

        // If we found no unrevealed cells adjacent to numbers, area is solved
        return !hasUnrevealedSafeCells;
    },

    // Get next move for a player
    getNextMove: function (username) {
        const knowledge = this.getKnowledge(username);

        // Rate limit actions (1-5 seconds)
        const timeSinceLastAction = Date.now() - knowledge.lastActionTime;
        if (timeSinceLastAction < 1000 + Math.random() * 4000) {
            return null;
        }

        const analysis = this.analyzeBoard(username);

        // First priority: Flag ALL identified mines
        // Convert to array and sort by distance to current position for more natural movement
        const mineMoves = Array.from(analysis.mineMoves).map(key => {
            const [x, y] = key.split(',').map(Number);
            const dx = x - knowledge.currentX;
            const dy = y - knowledge.currentY;
            return { x, y, distance: Math.hypot(dx, dy) };
        }).sort((a, b) => a.distance - b.distance);

        if (mineMoves.length > 0) {
            // Always flag the closest identified mine
            return {
                x: mineMoves[0].x,
                y: mineMoves[0].y,
                action: 'flag',
                certainty: 1.0,
                // Include all other mines we've identified for batch processing
                additionalMines: mineMoves.slice(1)
            };
        }

        // Second priority: Safe moves we've identified
        if (analysis.safeMoves.size > 0) {
            const move = Array.from(analysis.safeMoves)[0];
            const [x, y] = move.split(',').map(Number);
            return { x, y, action: 'reveal', certainty: 1.0 };
        }

        // Check if we're stuck in a solved area
        if (this.isAreaSolved(username)) {
            // Find the nearest unrevealed cell that's adjacent to a number
            const searchRadius = this.VISION_RANGE;
            let bestMove = null;
            let bestDistance = Infinity;

            for (let dx = -searchRadius; dx <= searchRadius; dx++) {
                for (let dy = -searchRadius; dy <= searchRadius; dy++) {
                    const x = knowledge.currentX + dx;
                    const y = knowledge.currentY + dy;
                    if (!MinesweeperDB.isValidPosition(x, y)) continue;

                    const key = `${x},${y}`;
                    if (!knowledge.revealed.has(key) && !knowledge.flagged.has(key)) {
                        // Check if this cell is adjacent to a revealed number
                        const neighbors = this.getNeighbors(x, y, knowledge.currentX, knowledge.currentY);
                        for (const neighbor of neighbors) {
                            const neighborKey = `${neighbor.x},${neighbor.y}`;
                            if (knowledge.revealed.has(neighborKey)) {
                                const adjacentMines = MinesweeperDB.getAdjacentMines(neighbor.x, neighbor.y);
                                if (adjacentMines > 0) {
                                    const distance = Math.hypot(dx, dy);
                                    if (distance < bestDistance) {
                                        bestDistance = distance;
                                        bestMove = { x, y };
                                    }
                                    break;
                                }
                            }
                        }
                    }
                }
            }

            if (bestMove) {
                return {
                    x: bestMove.x,
                    y: bestMove.y,
                    action: 'move',
                    certainty: 0.8
                };
            }

            // If no good moves found nearby, move to a completely new area
            const angle = Math.random() * 2 * Math.PI;
            const distance = this.VISION_RANGE * 2; // Move further to escape solved area
            return {
                x: knowledge.currentX + Math.cos(angle) * distance,
                y: knowledge.currentY + Math.sin(angle) * distance,
                action: 'move',
                certainty: 0.7
            };
        }

        // Third priority: Best guess from frontier within vision range
        const visibleFrontier = Array.from(knowledge.frontier).filter(key => {
            const [x, y] = key.split(',').map(Number);
            return this.isInVisionRange(x, y, knowledge.currentX, knowledge.currentY);
        });

        if (visibleFrontier.length > 0) {
            // Find the frontier cell with the most revealed neighbors
            const frontierWithScores = visibleFrontier.map(key => {
                const [x, y] = key.split(',').map(Number);
                const neighbors = this.getNeighbors(x, y, knowledge.currentX, knowledge.currentY);
                const revealedCount = neighbors.filter(n =>
                    knowledge.revealed.has(`${n.x},${n.y}`)
                ).length;
                return { key, revealedCount };
            });

            // Sort by revealed neighbors count (more revealed neighbors = more information)
            frontierWithScores.sort((a, b) => b.revealedCount - a.revealedCount);
            const bestMove = frontierWithScores[0].key;
            const [x, y] = bestMove.split(',').map(Number);
            return { x, y, action: 'reveal', certainty: 0.5 };
        }

        // Check if we're in a completely unexplored area
        let hasRevealedNearby = false;
        const nearbyRadius = 5; // Check smaller radius for immediate surroundings
        for (let dx = -nearbyRadius; dx <= nearbyRadius; dx++) {
            for (let dy = -nearbyRadius; dy <= nearbyRadius; dy++) {
                const checkX = knowledge.currentX + dx;
                const checkY = knowledge.currentY + dy;
                if (MinesweeperDB.isValidPosition(checkX, checkY) &&
                    knowledge.revealed.has(`${checkX},${checkY}`)) {
                    hasRevealedNearby = true;
                    break;
                }
            }
            if (hasRevealedNearby) break;
        }

        // If no revealed cells nearby, start revealing!
        if (!hasRevealedNearby) {
            // Try to reveal a cell near current position
            const possibleMoves = [];
            for (let dx = -2; dx <= 2; dx++) {
                for (let dy = -2; dy <= 2; dy++) {
                    const newX = knowledge.currentX + dx;
                    const newY = knowledge.currentY + dy;
                    if (MinesweeperDB.isValidPosition(newX, newY)) {
                        const key = `${newX},${newY}`;
                        if (!knowledge.revealed.has(key) && !knowledge.flagged.has(key)) {
                            possibleMoves.push({ x: newX, y: newY });
                        }
                    }
                }
            }
            if (possibleMoves.length > 0) {
                const move = possibleMoves[Math.floor(Math.random() * possibleMoves.length)];
                return { x: move.x, y: move.y, action: 'reveal', certainty: 0.3 };
            }
        }

        // Fourth priority: Find an unexplored area with revealed cells nearby
        const searchRadius = this.VISION_RANGE;
        const potentialMoves = [];

        for (let dx = -searchRadius; dx <= searchRadius; dx += 5) {  // Step by 5 for efficiency
            for (let dy = -searchRadius; dy <= searchRadius; dy += 5) {
                const newX = knowledge.currentX + dx;
                const newY = knowledge.currentY + dy;

                if (!MinesweeperDB.isValidPosition(newX, newY)) continue;

                // Check if this area has any revealed cells but also has unexplored cells
                let revealedCount = 0;
                let unexploredCount = 0;
                const areaSize = 5; // Check a 5x5 area around this point

                for (let ax = -areaSize; ax <= areaSize; ax++) {
                    for (let ay = -areaSize; ay <= areaSize; ay++) {
                        const areaX = newX + ax;
                        const areaY = newY + ay;
                        if (!MinesweeperDB.isValidPosition(areaX, areaY)) continue;

                        const key = `${areaX},${areaY}`;
                        if (knowledge.revealed.has(key)) {
                            revealedCount++;
                        } else if (!knowledge.flagged.has(key)) {
                            unexploredCount++;
                        }
                    }
                }

                // Good area has either:
                // 1. Both revealed and unexplored cells (for continuing exploration)
                // 2. Or just unexplored cells (for starting new areas)
                if (unexploredCount > 0 && (revealedCount > 0 || Math.random() < 0.3)) {
                    potentialMoves.push({
                        x: newX,
                        y: newY,
                        score: revealedCount + unexploredCount + (revealedCount > 0 ? 10 : 0)
                    });
                }
            }
        }

        if (potentialMoves.length > 0) {
            // Move to the area with the best combination of revealed and unexplored cells
            potentialMoves.sort((a, b) => b.score - a.score);
            const bestArea = potentialMoves[0];
            return {
                x: bestArea.x,
                y: bestArea.y,
                action: 'move',
                certainty: 0.4
            };
        }

        // Last resort: Move to a completely unexplored area
        const angle = Math.random() * 2 * Math.PI;
        const distance = this.VISION_RANGE * 1.5; // Move 1.5x vision range to ensure new area
        return {
            x: knowledge.currentX + Math.cos(angle) * distance,
            y: knowledge.currentY + Math.sin(angle) * distance,
            action: 'move',
            certainty: 0.2
        };
    }
}; 