// Configuration management for the Minesweeper game
const Config = {
    SERVER: {
        // Default for local development
        DEFAULT_URL: 'ws://localhost:9001/minefield',

        // List of known servers
        SERVERS: [
            { name: 'Local Development', url: 'ws://localhost:9001/minefield' },
            { name: 'Local Network', url: 'ws://localhost:9001/minefield' }, // Update this when deploying
        ],

        // Get from localStorage or environment
        get currentUrl() {
            return localStorage.getItem('server_url') || this.DEFAULT_URL;
        },

        set currentUrl(url) {
            localStorage.setItem('server_url', url);
        }
    }
};

// Prevent modifications to the config object
Object.freeze(Config);
Object.freeze(Config.SERVER);
Object.freeze(Config.SERVER.SERVERS);

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Config;
} 