const ConnectionScreen = {
    show: async function (container) {
        container.innerHTML = `
            <div class="connection-choice">
                <h2>Choose Game Mode</h2>
                
                <div class="choice-buttons">
                    <button class="choice-btn server-btn">
                        <i class="fas fa-globe"></i>
                        Connect to Game Server
                        <small>Local Development (ws://localhost:9001)</small>
                    </button>
                    
                    <button class="choice-btn local-btn">
                        <i class="fas fa-laptop"></i>
                        Play Offline
                        <small>Use mock data for testing</small>
                    </button>
                    
                    <div class="error-message hidden">
                        <i class="fas fa-exclamation-triangle"></i>
                        <div class="error-content">
                            <strong>Server Not Found</strong>
                            <p>Could not connect to the game server. Please:</p>
                            <ol>
                                <li>Make sure the server is running (<code>./minesweeper</code>)</li>
                                <li>Check that it's running on port 9001</li>
                                <li>Try again or use offline mode</li>
                            </ol>
                        </div>
                    </div>
                    
                    <div class="server-config hidden">
                        <select id="serverSelect">
                            ${Config.SERVER.SERVERS.map(server =>
            `<option value="${server.url}">${server.name}</option>`
        ).join('')}
                            <option value="custom">Custom Server...</option>
                        </select>
                        
                        <input type="text" 
                               id="customServer" 
                               class="hidden"
                               placeholder="ws://your-server:port"
                               value="${Config.SERVER.currentUrl}">
                               
                        <button class="connect-btn">Connect</button>
                        
                        <div class="connection-status hidden">
                            <span class="spinner">⌛</span> Connecting...
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Server selection UI
        const serverSelect = container.querySelector('#serverSelect');
        const customServer = container.querySelector('#customServer');
        const serverConfig = container.querySelector('.server-config');
        const statusDiv = container.querySelector('.connection-status');
        const errorDiv = container.querySelector('.error-message');

        function showError(message, isServerNotFound = false) {
            if (isServerNotFound) {
                // Show the detailed server not found error
                errorDiv.classList.remove('hidden');
            } else {
                // Show a simple error message
                errorDiv.classList.remove('hidden');
                errorDiv.innerHTML = `
                    <i class="fas fa-exclamation-triangle"></i>
                    <div class="error-content">
                        <p>${message}</p>
                    </div>
                `;
            }
        }

        function hideError() {
            errorDiv.classList.add('hidden');
        }

        // Direct connection function
        async function connectToServer(serverUrl) {
            try {
                hideError();
                statusDiv.classList.remove('hidden');
                statusDiv.innerHTML = '<span class="spinner">⌛</span> Checking server status...';

                const connection = new WebSocketGameConnection(serverUrl);

                try {
                    await connection.testConnection();
                } catch (error) {
                    showError(null, true);  // Show the detailed server not found error
                    return;
                }

                statusDiv.innerHTML = '<span class="spinner">⌛</span> Connecting...';

                // Save working URL
                Config.SERVER.currentUrl = serverUrl;

                // Connect for real
                if (await connection.connect()) {
                    GameState.setConnection(connection);
                    App.showScreen(App.screens.LOGIN);
                }
            } catch (error) {
                showError(error.message);
            } finally {
                statusDiv.classList.add('hidden');
            }
        }

        // Handle local mode
        container.querySelector('.local-btn').onclick = async () => {
            try {
                // First check if we have a file handle
                if (!MinesweeperDB.fileHandle) {
                    // Redirect to file select first
                    App.showScreen(App.screens.FILE_SELECT);
                    return;
                }

                const connection = new MockGameConnection(MinesweeperDB);
                if (await connection.connect()) {
                    GameState.setConnection(connection);
                    App.showScreen(App.screens.FILE_SELECT);
                }
            } catch (error) {
                showError("Could not initialize local game: " + error.message);
            }
        };

        // Handle server mode - direct connect to local development
        container.querySelector('.server-btn').onclick = async () => {
            // Try to connect to local development server directly
            await connectToServer(Config.SERVER.DEFAULT_URL);
        };

        // Show advanced server options on right click
        container.querySelector('.server-btn').oncontextmenu = (e) => {
            e.preventDefault();
            serverConfig.classList.remove('hidden');
        };

        serverSelect.onchange = () => {
            if (serverSelect.value === 'custom') {
                customServer.classList.remove('hidden');
            } else {
                customServer.classList.add('hidden');
                customServer.value = serverSelect.value;
            }
            errorDiv.classList.add('hidden');
        };

        container.querySelector('.connect-btn').onclick = async () => {
            await connectToServer(customServer.value);
        };
    }
}; 