const FileSelectScreen = {
    show: function (container) {
        const html = `
            <div class="login-screen">
                <h1>Multiplayer Minesweeper</h1>
                <div class="file-select">
                    <p>Choose where to store game data:</p>
                    <button id="select-folder" class="primary-button">Select Game Data Folder</button>
                </div>
            </div>
        `;
        container.innerHTML = html;
        this.attachEventListeners();
    },

    attachEventListeners: function () {
        document.getElementById('select-folder').addEventListener('click', async () => {
            try {
                // Request directory access
                const dirHandle = await window.showDirectoryPicker();

                // Get file handles for both files
                MockDB.fileHandle = await dirHandle.getFileHandle('players.json', { create: true });
                MinesweeperDB.fileHandle = await dirHandle.getFileHandle('mines.json', { create: true });

                // Initialize both DBs
                await Promise.all([
                    MockDB.init(),
                    MinesweeperDB.init()
                ]);

                App.showScreen(App.screens.LOGIN);
            } catch (error) {
                console.error('Folder selection error:', error);
                alert('Failed to set up game data folder. Please try again.');
            }
        });
    }
}; 