// Configuration management for the Minesweeper game
const Config = {
    SERVER: {
        // Get the current hostname
        get DEFAULT_URL() {
            const hostname = window.location.hostname;
            return `ws://${hostname}:9001/minefield`;
        }
    }
};

// Prevent modifications to the config object
Object.freeze(Config);
Object.freeze(Config.SERVER);

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Config;
} 