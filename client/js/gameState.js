const GameState = {
    // Predefined avatars (10x10 grid of unique objects)
    defaultAvatar: '👤',
    avatars: [
        '🎈', '🎨', '🎭', '🎪', '🎰', '🎲', '🎯', '🎱', '🎳', '🎸',
        '🎺', '🎻', '🎬', '📷', '📺', '💻', '☎️', '📱', '⌚️', '💡',
        '🔦', '🔭', '⚽️', '🏀', '🏈', '⚾️', '🎾', '🏓', '🎹', '🎼',
        '🚗', '🚕', '🚙', '🚌', '🚎', '🏎️', '🚓', '🚑', '🚒', '✈️',
        '🚀', '🛸', '⚓️', '🪁', '💎', '🔮', '🎮', '🎧', '🔋', '⚡️',
        '🌈', '☀️', '🌙', '⭐️', '🌍', '🌋', '🗻', '🌵', '🌴', '🌲',
        '🍄', '🌺', '🌻', '🌹', '🌸', '🍀', '🎋', '🎍', '🎪', '⛺️',
        '🗽', '🗼', '🏰', '⛩️', '🕌', '⛪️', '🏛️', '🏢', '🏭', '⚔️',
        '🛡️', '🔱', '⚜️', '🔰', '⭕️', '✅', '☑️', '✨', '⚡️', '☄️',
        '🌠', '🎆', '🎇', '🧨', '🎉', '🎊', '🎫', '🎪', '🎭', '🎨'
    ],

    // Predefined colors (10x10 grid - full spectrum with good contrast)
    defaultColor: '#000',
    colors: [
        // Reds to Oranges
        '#FF0000', '#FF1A1A', '#FF3333', '#FF4D4D', '#FF6666', '#FF8080', '#FF9999', '#FFB2B2', '#FFCCCC', '#FFE5E5',
        '#FF4000', '#FF5419', '#FF6833', '#FF7C4D', '#FF9066', '#FFA480', '#FFB899', '#FFCCB2', '#FFE0CC', '#FFF4E5',
        // Oranges to Yellows
        '#FF8000', '#FF8F19', '#FF9F33', '#FFAF4D', '#FFBF66', '#FFCF80', '#FFDF99', '#FFEFB2', '#FFFFCC', '#FFFFE5',
        '#FFB300', '#FFC119', '#FFCF33', '#FFDC4D', '#FFE966', '#FFF680', '#FFFF99', '#FFFFB2', '#FFFFCC', '#FFFFE5',
        // Yellows to Greens
        '#CCFF00', '#D4FF19', '#DCFF33', '#E3FF4D', '#EBFF66', '#F2FF80', '#F9FF99', '#FFFFB2', '#FFFFCC', '#FFFFE5',
        '#66FF00', '#75FF19', '#85FF33', '#94FF4D', '#A3FF66', '#B3FF80', '#C2FF99', '#D1FFB2', '#E0FFCC', '#F0FFE5',
        // Greens to Blues
        '#00FF00', '#19FF19', '#33FF33', '#4DFF4D', '#66FF66', '#80FF80', '#99FF99', '#B2FFB2', '#CCFFCC', '#E5FFE5',
        '#00FF66', '#19FF75', '#33FF85', '#4DFF94', '#66FFA3', '#80FFB3', '#99FFC2', '#B2FFD1', '#CCFFE0', '#E5FFF0',
        // Blues to Purples
        '#0000FF', '#1919FF', '#3333FF', '#4D4DFF', '#6666FF', '#8080FF', '#9999FF', '#B2B2FF', '#CCCCFF', '#E5E5FF',
        '#6600FF', '#7519FF', '#8533FF', '#944DFF', '#A366FF', '#B380FF', '#C299FF', '#D1B2FF', '#E0CCFF', '#F0E5FF'
    ],

    // Event handling
    eventListeners: new Map(),

    on: function (event, callback) {
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, new Set());
        }
        this.eventListeners.get(event).add(callback);
    },

    off: function (event, callback) {
        if (this.eventListeners.has(event)) {
            this.eventListeners.get(event).delete(callback);
        }
    },

    emit: function (event, data) {
        if (this.eventListeners.has(event)) {
            this.eventListeners.get(event).forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`Error in ${event} event handler:`, error);
                }
            });
        }
    },

    // Track all players
    players: new Map(),
    userid: null,

    currentUser: function() {
        return this.players.get(this.userid);
    },

    // Add connection management
    connection: null,

    setConnection: function (connection) {
        if (this.connection) {
            this.connection.disconnect();
        }
        this.connection = connection;
    },

    disconnect: function () {
        if (this.connection) {
            this.connection.disconnect();
            this.connection = null;
        }
        this.userid = 0;
        this.players.clear();
        this.emit('playersUpdated');
    },

    init: async function () { },

    updatePlayer: function (userData) {
        this.players.set(userData.userId, userData);
        console.log('Updated player data:', userData);
        this.emit('playersUpdated');
    }
}; 