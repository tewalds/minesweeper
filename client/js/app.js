const App = {
    screens: {
        CONNECTION: 'connection',
        FILE_SELECT: 'file_select',
        LOGIN: 'login',
        CUSTOMIZE: 'customize',
        SPAWN: 'spawn',
        PLAY: 'play'
    },

    currentScreen: null,

    init: async function () {
        this.addSettingsMenu();

        // Always start with connection choice
        this.showScreen(this.screens.CONNECTION);
    },

    showScreen: async function (screenName) {
        this.currentScreen = screenName;
        const appDiv = document.getElementById('app');
        const screenContent = appDiv.querySelector('.screen-content') || appDiv.appendChild(document.createElement('div'));
        screenContent.className = 'screen-content';
        screenContent.innerHTML = ''; // Only clear screen content

        switch (screenName) {
            case this.screens.CONNECTION:
                await ConnectionScreen.show(screenContent);
                break;
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
                GameState.disconnect();
                GameState.currentUser = {
                    username: null,
                    avatar: null,
                    color: null,
                    x: null,
                    y: null
                };
                this.showScreen(this.screens.CONNECTION);
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