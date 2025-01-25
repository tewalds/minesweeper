const FileSelectScreen = {
    show: function (container) {
        const html = `
            <div class="login-screen">
                <h1>Multiplayer Minesweeper</h1>
                <div class="file-select">
                    <p>Choose where to store player data:</p>
                    <button id="select-file" class="primary-button">Select File Location</button>
                </div>
            </div>
        `;
        container.innerHTML = html;
        this.attachEventListeners();
    },

    attachEventListeners: function () {
        document.getElementById('select-file').addEventListener('click', async () => {
            try {
                const success = await MockDB.requestFileAccess();
                if (success) {
                    await MockDB.init();
                    App.showScreen(App.screens.LOGIN);
                } else {
                    alert('Failed to get file access. Please try again.');
                }
            } catch (error) {
                console.error('File selection error:', error);
                alert('Failed to set up file access. Please try again.');
            }
        });
    }
}; 