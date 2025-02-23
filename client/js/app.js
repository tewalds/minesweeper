const App = {
    screens: {
        LOGIN: 'login',
        CUSTOMIZE: 'customize',
        SPAWN: 'spawn',
        PLAY: 'play'
    },

    currentScreen: null,

    init: async function () {
        this.addSettingsMenu();

        try {
            // Auto-connect to local server
            const connection = new GameConnection();

            // Connect to server
            if (await connection.connect()) {
                GameState.setConnection(connection);
                // Start with login screen
                this.showScreen(this.screens.LOGIN);
            } else {
                throw new Error('Failed to connect to server');
            }
        } catch (error) {
            console.error('Failed to connect:', error);
            alert('Failed to connect to game server. Please ensure the server is running.');
        }
    },

    showScreen: async function (screenName) {
        this.currentScreen = screenName;
        const appDiv = document.getElementById('app');
        const screenContent = appDiv.querySelector('.screen-content') || appDiv.appendChild(document.createElement('div'));
        screenContent.className = 'screen-content';
        screenContent.innerHTML = ''; // Only clear screen content

        switch (screenName) {
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
                GameState.disconnect();
                GameState.currentUser = {
                    username: null,
                    avatar: null,
                    color: null,
                    x: null,
                    y: null
                };
                // Try to reconnect after logout
                this.init();
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
