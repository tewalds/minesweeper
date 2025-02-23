// Configuration management for the Minesweeper game
const Config = {
    SERVER: {
        // Get the current hostname
        get DEFAULT_URL() {
            return `ws://${window.location.host}/minefield`;
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