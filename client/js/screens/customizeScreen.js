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
        if (GameState.userid) {
            document.querySelector('.back-button').style.display = 'none';
        }

        this.attachEventListeners(container);
        document.getElementById('customize-done').disabled = true;
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
            GameState.disconnect();
            App.showScreen(App.screens.LOGIN);
        });

        let selectedAvatar = null;
        let selectedColor = null;

        avatarGrid?.addEventListener('click', (e) => {
            const avatarOption = e.target.closest('.avatar-option');
            if (!avatarOption) return;

            // Update selection
            container.querySelectorAll('.avatar-option').forEach(opt => opt.classList.remove('selected'));
            avatarOption.classList.add('selected');

            container.querySelector('#avatar-preview').textContent = avatarOption.dataset.avatar;
            selectedAvatar = avatarOption.dataset.index;

            // Enable continue if both avatar and color are selected
            continueBtn.disabled = !selectedColor;
        });

        colorGrid?.addEventListener('click', (e) => {
            const colorOption = e.target.closest('.color-option');
            if (!colorOption) return;

            // Update selection
            container.querySelectorAll('.color-option').forEach(opt => opt.classList.remove('selected'));
            colorOption.classList.add('selected');

            container.querySelector('#color-preview').style.backgroundColor = colorOption.dataset.color;
            selectedColor = colorOption.dataset.index;

            // Enable continue if both avatar and color are selected
            continueBtn.disabled = !selectedAvatar;
        });

        continueBtn?.addEventListener('click', async () => {
            try {
                let user = GameState.currentUser();
                user.colorIndex = selectedColor;
                user.color = GameState.colors[selectedColor];
                user.avatarIndex = selectedAvatar;
                user.avatar = GameState.avatars[selectedAvatar];
                GameState.updatePlayer(user);
                await GameState.connection.sendSettings(selectedColor, selectedAvatar);
            } catch (error) {
                console.error('Failed to send settings:', error);
                alert('Failed to save appearance. Please try again.');
                return;
            }

            App.showScreen(App.screens.SPAWN);
        });
    }
}; 