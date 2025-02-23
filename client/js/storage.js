const GameStorage = {
    // Keys
    USERNAME_KEY: 'minesweeper_username',
    USERID_KEY: 'minesweeper_userid',
    AVATAR_KEY: 'minesweeper_avatar',
    COLOR_KEY: 'minesweeper_color',

    save: function (key, value) {
        localStorage.setItem(key, JSON.stringify(value));
    },

    load: function (key) {
        const value = localStorage.getItem(key);
        return value ? JSON.parse(value) : null;
    },

    // Helper methods for user-specific data
    saveUserData: function (username, dataKey, value) {
        this.save(`${username}_${dataKey}`, value);
    },

    loadUserData: function (username, dataKey) {
        return this.load(`${username}_${dataKey}`);
    }
}; 