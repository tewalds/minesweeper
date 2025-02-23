const LoginScreen = {
    show: function (container) {
        // Load previous username if exists
        const savedUsername = GameStorage.load(GameStorage.USERNAME_KEY);

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

                try {
                    console.log('Attempting to login with username:', username);
                    // Login with username
                    const userData = await GameState.connection.loginPlayer(username);
                    console.log('Received user data from server:', userData);
                    GameState.updateFromServer(userData);

                    // Check if we need to customize (new user)
                    const needsCustomization = GameState.currentUser.colorIndex === -1 || GameState.currentUser.avatarIndex === -1;
                    console.log('User customization status:', {
                        colorIndex: GameState.currentUser.colorIndex,
                        avatarIndex: GameState.currentUser.avatarIndex,
                        needsCustomization
                    });

                    if (needsCustomization) {
                        console.log('New user, showing customize screen');
                        App.showScreen(App.screens.CUSTOMIZE);
                    } else {
                        console.log('Existing user with settings, going to spawn');
                        App.showScreen(App.screens.SPAWN);
                    }
                } catch (loginError) {
                    console.error('Login failed:', loginError);
                    alert('Login failed. Please try again.');
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