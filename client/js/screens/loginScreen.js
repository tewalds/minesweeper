const LoginScreen = {
    show: function (container) {
        const html = `
            <div class="login-screen">
                <h1>Multiplayer Minesweeper</h1>
                <div class="login-form">
                    <input type="text" id="username" placeholder="Enter username" maxlength="20">
                    <button id="login-button">Play</button>
                </div>
            </div>
        `;
        container.innerHTML = html;

        // Load previous username if exists
        const savedUsername = GameStorage.load(GameStorage.USERNAME_KEY);
        if (savedUsername) {
            document.getElementById('username').value = savedUsername;
        }

        this.attachEventListeners();
    },

    attachEventListeners: function () {
        const handleLogin = async () => {
            const usernameInput = document.getElementById('username');
            const username = usernameInput.value.trim();

            if (username.length < 3) {
                alert('Username must be at least 3 characters long');
                return;
            }

            try {
                // Save username
                GameStorage.save(GameStorage.USERNAME_KEY, username);
                GameState.currentUser.username = username;

                if (GameState.connection instanceof WebSocketGameConnection) {
                    // Server mode: Register with server and go straight to play
                    await GameState.connection.registerPlayer(username);
                    App.showScreen(App.screens.PLAY);
                } else {
                    // Local mode: Use mock DB
                    const savedPlayer = await MockDB.getPlayer(username);
                    console.log('Login attempt:', { username, exists: !!savedPlayer });

                    if (savedPlayer) {
                        // Existing player, load their data and go to spawn
                        console.log('Loading existing player:', savedPlayer);
                        GameState.currentUser.avatar = savedPlayer.avatar;
                        GameState.currentUser.color = savedPlayer.color;
                        await MockDB.updatePlayerLastSeen(username);
                        App.showScreen(App.screens.SPAWN);
                    } else {
                        // New user, go to customize screen
                        console.log('Creating new player');
                        App.showScreen(App.screens.CUSTOMIZE);
                    }
                }
            } catch (error) {
                console.error('Login error:', error);
                alert('There was an error logging in. Please try again.');
            }
        };

        // Handle button click
        document.getElementById('login-button').addEventListener('click', handleLogin);

        // Handle enter key
        document.getElementById('username').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                handleLogin();
            }
        });
    }
}; 