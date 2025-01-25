const CustomizeScreen = {
    show: function (container) {
        const html = `
            <div class="customize-screen">
                <div class="screen-header">
                    <button class="header-button back-button">← Back</button>
                    <h2>Customize Your Player</h2>
                    <button class="header-button settings-toggle">⚙️ Menu</button>
                    <div class="settings-dropdown hidden">
                        <button class="logout-button">Logout</button>
                    </div>
                </div>
                <div class="selection-area">
                    <div class="avatar-grid">
                        ${this.createAvatarGrid()}
                    </div>
                    <div class="color-grid">
                        ${this.createColorGrid()}
                    </div>
                </div>
                <div class="preview">
                    <div id="avatar-preview"></div>
                    <div id="color-preview"></div>
                </div>
                <button id="customize-done" disabled>Continue</button>
            </div>
        `;
        container.innerHTML = html;

        this.attachEventListeners();
        this.loadSavedSelections();
    },

    createAvatarGrid: function () {
        return GameState.avatars.map(avatar =>
            `<div class="avatar-option" data-avatar="${avatar}">${avatar}</div>`
        ).join('');
    },

    createColorGrid: function () {
        return GameState.colors.map(color =>
            `<div class="color-option" style="background-color: ${color}" data-color="${color}"></div>`
        ).join('');
    },

    loadSavedSelections: function () {
        const username = GameState.currentUser.username;
        const savedAvatar = GameStorage.loadUserData(username, 'avatar');
        const savedColor = GameStorage.loadUserData(username, 'color');

        if (savedAvatar) {
            document.querySelector(`[data-avatar="${savedAvatar}"]`)?.classList.add('selected');
            document.getElementById('avatar-preview').textContent = savedAvatar;
        }
        if (savedColor) {
            document.querySelector(`[data-color="${savedColor}"]`)?.classList.add('selected');
            document.getElementById('color-preview').style.backgroundColor = savedColor;
        }

        document.getElementById('customize-done').disabled = !(savedAvatar && savedColor);
    },

    attachEventListeners: function () {
        const avatarGrid = document.querySelector('.avatar-grid');
        const colorGrid = document.querySelector('.color-grid');
        const continueBtn = document.getElementById('customize-done');

        // Back button
        document.querySelector('.back-button').addEventListener('click', () => {
            App.showScreen(App.screens.LOGIN);
        });

        avatarGrid.addEventListener('click', (e) => {
            const avatarOption = e.target.closest('.avatar-option');
            if (!avatarOption) return;

            // Update selection
            document.querySelectorAll('.avatar-option').forEach(opt => opt.classList.remove('selected'));
            avatarOption.classList.add('selected');

            const avatar = avatarOption.dataset.avatar;
            document.getElementById('avatar-preview').textContent = avatar;
            GameStorage.saveUserData(GameState.currentUser.username, 'avatar', avatar);
            GameState.currentUser.avatar = avatar;

            // Enable continue if both selected
            continueBtn.disabled = !GameState.currentUser.color;
        });

        colorGrid.addEventListener('click', (e) => {
            const colorOption = e.target.closest('.color-option');
            if (!colorOption) return;

            // Update selection
            document.querySelectorAll('.color-option').forEach(opt => opt.classList.remove('selected'));
            colorOption.classList.add('selected');

            const color = colorOption.dataset.color;
            document.getElementById('color-preview').style.backgroundColor = color;
            GameStorage.saveUserData(GameState.currentUser.username, 'color', color);
            GameState.currentUser.color = color;

            // Enable continue if both selected
            continueBtn.disabled = !GameState.currentUser.avatar;
        });

        continueBtn.addEventListener('click', () => {
            App.showScreen(App.screens.SPAWN);
        });
    }
}; 