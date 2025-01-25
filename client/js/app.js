const App = {
    screens: {
        FILE_SELECT: 'file_select',
        LOGIN: 'login',
        CUSTOMIZE: 'customize',
        SPAWN: 'spawn',
        PLAY: 'play'
    },

    currentScreen: null,

    init: async function () {
        this.addSettingsMenu();

        // Start with file selection if we don't have a file handle
        if (!MockDB.fileHandle) {
            this.showScreen(this.screens.FILE_SELECT);
            return;
        }

        // Otherwise proceed with normal initialization
        await MockDB.init();
        await GameState.init();

        // Determine initial screen
        if (!GameState.currentUser.username) {
            this.showScreen(this.screens.LOGIN);
        } else if (!GameState.currentUser.avatar || !GameState.currentUser.color) {
            this.showScreen(this.screens.CUSTOMIZE);
        } else if (GameState.currentUser.x === null || GameState.currentUser.y === null) {
            this.showScreen(this.screens.SPAWN);
        } else {
            this.showScreen(this.screens.PLAY);
        }
    },

    showScreen: async function (screenName) {
        this.currentScreen = screenName;
        const appDiv = document.getElementById('app');
        const screenContent = appDiv.querySelector('.screen-content') || appDiv.appendChild(document.createElement('div'));
        screenContent.className = 'screen-content';
        screenContent.innerHTML = ''; // Only clear screen content

        switch (screenName) {
            case this.screens.FILE_SELECT:
                await FileSelectScreen.show(screenContent);
                break;
            case this.screens.LOGIN:
                await LoginScreen.show(screenContent);
                break;
            case this.screens.CUSTOMIZE:
                await CustomizeScreen.show(screenContent);
                break;
            case this.screens.SPAWN:
                await SpawnScreen.show(screenContent);
                break;
            case this.screens.PLAY:
                await PlayScreen.show(screenContent);
                break;
        }
    },

    addSettingsMenu: function () {
        // Settings menu is now added in each screen's HTML
        // We only need to handle the click events
        document.addEventListener('click', (e) => {
            const toggle = e.target.closest('.settings-toggle');
            if (toggle) {
                const dropdown = toggle.nextElementSibling;
                dropdown.classList.toggle('hidden');
                return;
            }

            // Close menu when clicking outside
            if (!e.target.closest('.settings-menu')) {
                document.querySelectorAll('.settings-dropdown').forEach(dropdown => {
                    dropdown.classList.add('hidden');
                });
            }

            // Handle logout
            if (e.target.closest('.logout-button')) {
                GameState.currentUser = {
                    username: null,
                    avatar: null,
                    color: null,
                    x: null,
                    y: null
                };
                this.showScreen(this.screens.LOGIN);
            }
        });
    }
};

// Start the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    App.init().catch(error => {
        console.error('Failed to initialize app:', error);
    });
}); 