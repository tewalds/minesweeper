// Configuration management for the Minesweeper game
const Config = {
    SERVER: {
        // Get the current hostname
        get DEFAULT_URL() {
            const hostname = window.location.hostname || 'localhost';
            return `ws://${hostname}:9001/minefield`;
        },

        // List of known servers
        SERVERS: [
            {
                get name() {
                    const hostname = window.location.hostname || 'localhost';
                    return `${hostname} Server`;
                },
                get url() {
                    const hostname = window.location.hostname || 'localhost';
                    return `ws://${hostname}:9001/minefield`;
                }
            }
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