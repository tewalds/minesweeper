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
        // No longer need to load saved selections since we're online only
        document.getElementById('customize-done').disabled = true;
    },

    attachEventListeners: function (container) {
        const avatarGrid = container.querySelector('.avatar-grid');
        const colorGrid = container.querySelector('.color-grid');
        const continueBtn = container.querySelector('#customize-done');
        const settingsToggle = container.querySelector('.settings-toggle');
        const settingsDropdown = container.querySelector('.settings-dropdown');

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
            GameState.currentUser.avatar = avatar;

            // Enable continue if both avatar and color are selected
            continueBtn.disabled = !(GameState.currentUser.avatar && GameState.currentUser.color);
        });

        colorGrid?.addEventListener('click', (e) => {
            const colorOption = e.target.closest('.color-option');
            if (!colorOption) return;

            // Update selection
            container.querySelectorAll('.color-option').forEach(opt => opt.classList.remove('selected'));
            colorOption.classList.add('selected');

            const color = colorOption.dataset.color;
            container.querySelector('#color-preview').style.backgroundColor = color;
            GameState.currentUser.color = color;

            // Enable continue if both avatar and color are selected
            continueBtn.disabled = !(GameState.currentUser.avatar && GameState.currentUser.color);
        });

        continueBtn?.addEventListener('click', async () => {
            try {
                // Get indices of selected color and avatar
                const colorIndex = GameState.colors.indexOf(GameState.currentUser.color);
                const avatarIndex = GameState.avatars.indexOf(GameState.currentUser.avatar);

                console.log('Sending settings with indices:', {
                    color: GameState.currentUser.color,
                    colorIndex,
                    avatar: GameState.currentUser.avatar,
                    avatarIndex
                });

                if (colorIndex === -1 || avatarIndex === -1) {
                    throw new Error("Invalid color or avatar selected");
                }

                // Send settings to server
                await GameState.connection.sendSettings(colorIndex, avatarIndex);
            } catch (error) {
                console.error('Failed to send settings:', error);
                alert('Failed to save appearance. Please try again.');
                return;
            }

            App.showScreen(App.screens.SPAWN);
        });
    }
}; 