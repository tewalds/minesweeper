const GameStorage = {
    // Keys
    USERNAME_KEY: 'minesweeper_username',
    USERID_KEY: 'minesweeper_userid',

    save: function (key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (error) {
            console.warn('Failed to save to localStorage:', error);
        }
    },

    load: function (key) {
        try {
            const value = localStorage.getItem(key);
            return value ? JSON.parse(value) : null;
        } catch (error) {
            console.warn('Failed to load from localStorage:', error);
            return null;
        }
    }
}; 