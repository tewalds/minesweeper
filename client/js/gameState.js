const GameState = {
    // Predefined avatars (10x10 grid of unique objects)
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

    currentUser: {
        username: null,
        userId: null,
        avatar: null,
        color: null,
        score: 0,
        view: null
    },

    // Add connection management
    connection: null,

    setConnection: function (connectionInstance) {
        if (this.connection) {
            this.connection.disconnect();
        }
        this.connection = connectionInstance;
    },

    disconnect: function () {
        if (this.connection) {
            this.connection.disconnect();
            this.connection = null;
        }
        // Clear current user data but keep username for convenience
        const username = this.currentUser.username;
        this.currentUser = {
            username,
            userId: null,
            avatar: null,
            color: null,
            score: 0,
            view: null
        };
        // Clear players
        this.players.clear();
        this.emit('playersUpdated');
    },

    init: async function () {
        // Load saved user data
        this.currentUser.username = GameStorage.load(GameStorage.USERNAME_KEY);
        this.currentUser.userId = GameStorage.load(GameStorage.USERID_KEY);

        // In local mode, load additional data
        if (this.currentUser.username && !this.connection) {
            const savedPlayer = await MockDB.getPlayer(this.currentUser.username);
            if (savedPlayer) {
                this.currentUser.avatar = savedPlayer.avatar;
                this.currentUser.color = savedPlayer.color;
                await MockDB.updatePlayerLastSeen(this.currentUser.username);
            }
        }
    },

    // Update user data from server
    updateFromServer: function (userData) {
        this.currentUser.userId = userData.userId;
        this.currentUser.username = userData.name;
        this.currentUser.avatar = userData.avatar;
        this.currentUser.color = userData.color;
        this.currentUser.score = userData.score;
        this.currentUser.view = userData.view;

        // Update players map
        this.players.set(userData.userId, {
            ...userData,
            lastActive: Date.now()
        });
        this.emit('playersUpdated');

        // Save userid for future logins
        GameStorage.save(GameStorage.USERID_KEY, userData.userId);
    },

    // Update other player data
    updatePlayer: function (userData) {
        if (userData.userId !== this.currentUser.userId) {
            this.players.set(userData.userId, {
                ...userData,
                lastActive: Date.now()
            });
            this.emit('playersUpdated');
        }
    },

    // Only used in local mode now
    finalizePlayer: async function (x, y) {
        if (!this.connection &&
            this.currentUser.username &&
            this.currentUser.avatar &&
            this.currentUser.color &&
            x !== null &&
            y !== null) {
            await MockDB.addOrUpdatePlayer({
                username: this.currentUser.username,
                avatar: this.currentUser.avatar,
                color: this.currentUser.color,
                x: x,
                y: y
            });
        }
    }
}; 