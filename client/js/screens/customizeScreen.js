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

        // Hide back button if we have a userId (registered player)
        if (GameState.currentUser.userId) {
            document.querySelector('.back-button').style.display = 'none';
        }

        this.attachEventListeners(container);
        this.loadSavedSelections();
    },

    createAvatarGrid: function () {
        return GameState.avatars.map((avatar, index) =>
            `<div class="avatar-option" data-avatar="${avatar}" data-index="${index}">${avatar}</div>`
        ).join('');
    },

    createColorGrid: function () {
        return GameState.colors.map((color, index) =>
            `<div class="color-option" style="background-color: ${color}" data-color="${color}" data-index="${index}"></div>`
        ).join('');
    },

    loadSavedSelections: function () {
        const username = GameState.currentUser.username;
        const isServerMode = GameState.connection instanceof WebSocketGameConnection;

        if (!isServerMode) {
            // Only load saved selections in local mode
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
        }
    },

    attachEventListeners: function (container) {
        const avatarGrid = container.querySelector('.avatar-grid');
        const colorGrid = container.querySelector('.color-grid');
        const continueBtn = container.querySelector('#customize-done');
        const settingsToggle = container.querySelector('.settings-toggle');
        const settingsDropdown = container.querySelector('.settings-dropdown');
        const isServerMode = GameState.connection instanceof WebSocketGameConnection;

        // Back button
        container.querySelector('.back-button')?.addEventListener('click', () => {
            App.showScreen(App.screens.LOGIN);
        });

        // Settings toggle
        if (settingsToggle && settingsDropdown) {
            settingsToggle.addEventListener('click', (e) => {
                e.stopPropagation();
                settingsDropdown.classList.toggle('hidden');
            });

            // Close dropdown when clicking outside
            const closeDropdown = (e) => {
                if (!settingsDropdown.contains(e.target) && !settingsToggle.contains(e.target)) {
                    settingsDropdown.classList.add('hidden');
                }
            };
            document.addEventListener('click', closeDropdown);

            // Clean up when screen changes
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (!document.contains(container)) {
                        document.removeEventListener('click', closeDropdown);
                        observer.disconnect();
                    }
                });
            });
            observer.observe(document.body, { childList: true, subtree: true });
        }

        // Logout button
        container.querySelector('.logout-button')?.addEventListener('click', () => {
            // Disconnect from server/clear connection
            GameState.disconnect();

            // Clear user data but keep username for convenience
            const username = GameState.currentUser.username;
            GameState.currentUser = {
                username,
                userId: null,
                avatar: null,
                color: null,
                score: 0,
                view: null
            };

            // Clear saved user ID
            GameStorage.save(GameStorage.USERID_KEY, null);

            // Return to connection screen
            App.showScreen(App.screens.CONNECTION);
        });

        avatarGrid?.addEventListener('click', (e) => {
            const avatarOption = e.target.closest('.avatar-option');
            if (!avatarOption) return;

            // Update selection
            container.querySelectorAll('.avatar-option').forEach(opt => opt.classList.remove('selected'));
            avatarOption.classList.add('selected');

            const avatar = avatarOption.dataset.avatar;
            container.querySelector('#avatar-preview').textContent = avatar;

            if (!isServerMode) {
                GameStorage.saveUserData(GameState.currentUser.username, 'avatar', avatar);
            }
            GameState.currentUser.avatar = avatar;

            // Enable continue if both selected
            continueBtn.disabled = !GameState.currentUser.color;
        });

        colorGrid?.addEventListener('click', (e) => {
            const colorOption = e.target.closest('.color-option');
            if (!colorOption) return;

            // Update selection
            container.querySelectorAll('.color-option').forEach(opt => opt.classList.remove('selected'));
            colorOption.classList.add('selected');

            const color = colorOption.dataset.color;
            container.querySelector('#color-preview').style.backgroundColor = color;

            if (!isServerMode) {
                GameStorage.saveUserData(GameState.currentUser.username, 'color', color);
            }
            GameState.currentUser.color = color;

            // Enable continue if both selected
            continueBtn.disabled = !GameState.currentUser.avatar;
        });

        continueBtn?.addEventListener('click', () => {
            App.showScreen(App.screens.SPAWN);
        });
    }
}; 