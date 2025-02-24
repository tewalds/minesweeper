const LoginScreen = {
    USERNAME_KEY: 'minesweeper_username',

    show: function (container) {
        // Load previous username if exists
        const savedUsername = localStorage.getItem(this.USERNAME_KEY);

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

            if (username.length < 3 || username.length > 32) {
                alert('Username must be between 3 and 32 characters long');
                return;
            }
            if (username.includes(' ')) {
                alert('Username cannot contain spaces');
                return;
            }

            try {
                // Save username
                localStorage.setItem(this.USERNAME_KEY, username);

                try {
                    console.log('Attempting to login with username:', username);
                    // Login with username
                    const userData = await GameState.connection.loginPlayer(username);
                    console.log('Received user data from server:', userData);

                    // Check if we need to customize (new user)
                    const needsCustomization = (userData.colorIndex === -1 || userData.avatarIndex === -1);
                    console.log('User customization status:', {
                        colorIndex: userData.colorIndex,
                        avatarIndex: userData.avatarIndex,
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