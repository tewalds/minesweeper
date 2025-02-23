// Base class for game connections (both mock and websocket)
class GameConnection {
    constructor() {
        if (this.constructor === GameConnection) {
            throw new Error("Cannot instantiate abstract GameConnection class");
        }

        // Event handlers that implementations should call
        this.onGridInfo = (width, height, userId) => { };
        this.onUpdate = (state, x, y, userId) => { };
        this.onPlayerJoin = (userId, name) => { };
        this.onReset = () => { };
        this.onError = (error) => { };
    }

    // Core methods that both implementations must provide
    async connect() { throw new Error("Not implemented"); }
    async disconnect() { throw new Error("Not implemented"); }
    async registerPlayer(name) { throw new Error("Not implemented"); }
    async openCell(x, y) { throw new Error("Not implemented"); }
    async markCell(x, y) { throw new Error("Not implemented"); }
}

// Mock implementation using existing DB
class MockGameConnection extends GameConnection {
    constructor(db) {
        super();
        this.db = db;
        this.userId = 1; // Mock always uses ID 1
    }

    async connect() {
        try {
            await this.db.init();
            this.onGridInfo(this.db.gridWidth, this.db.gridHeight, this.userId);
            return true;
        } catch (error) {
            this.onError(error);
            return false;
        }
    }

    async disconnect() {
        // Nothing to do for mock
    }

    async registerPlayer(name) {
        try {
            // Use existing mock player registration
            this.onPlayerJoin(this.userId, name);
            return true;
        } catch (error) {
            this.onError(error);
            return false;
        }
    }

    async openCell(x, y) {
        try {
            const result = await this.db.revealCell(x, y, this.userId);
            if (result) {
                this.onUpdate(result.state, x, y, this.userId);
            }
            return true;
        } catch (error) {
            this.onError(error);
            return false;
        }
    }

    async markCell(x, y) {
        try {
            // Implement mock cell marking
            return true;
        } catch (error) {
            this.onError(error);
            return false;
        }
    }
}

// WebSocket implementation for real server
class WebSocketGameConnection extends GameConnection {
    constructor(serverUrl) {
        super();
        this.serverUrl = serverUrl;
        this.ws = null;
        this.connected = false;
        this.registrationPromise = null;  // Track registration completion
        this.loginPromise = null;  // Track login completion
        this.gridInfo = null;  // Store grid info
    }

    async testConnection() {
        return new Promise((resolve, reject) => {
            const ws = new WebSocket(this.serverUrl);

            const timeout = setTimeout(() => {
                ws.close();
                reject(new Error("Connection timed out after 5 seconds"));
            }, 5000);

            ws.onopen = () => {
                clearTimeout(timeout);
                ws.close();
                resolve(true);
            };

            ws.onerror = (error) => {
                clearTimeout(timeout);
                reject(new Error(`Connection failed. Make sure the server is running at ${this.serverUrl}`));
            };
        });
    }

    async connect() {
        try {
            this.ws = new WebSocket(this.serverUrl);

            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    this.ws.close();
                    reject(new Error("Connection timed out after 5 seconds"));
                }, 5000);

                this.ws.onmessage = (event) => {
                    try {
                        const [command, ...args] = event.data.split(' ');
                        console.log('Received WebSocket message:', { command, args });

                        switch (command) {
                            case 'grid': {
                                const [width, height] = args.map(Number);
                                this.gridInfo = { width, height };  // Store grid info
                                this.onGridInfo(width, height);
                                break;
                            }
                            case 'update': {
                                const [state, x, y, updateUserId] = args.map(Number);
                                this.onUpdate(state, x, y, updateUserId);
                                break;
                            }
                            case 'user': {
                                const [userId, name, colorIndex, avatarIndex, score, viewX1, viewY1, viewX2, viewY2] = args;
                                console.log('Processing user data:', {
                                    userId: parseInt(userId),
                                    name,
                                    colorIndex: parseInt(colorIndex),
                                    avatarIndex: parseInt(avatarIndex)
                                });
                                const userData = {
                                    userId: parseInt(userId),
                                    name,
                                    color: parseInt(colorIndex),
                                    avatar: parseInt(avatarIndex),
                                    score: parseInt(score),
                                    view: {
                                        x1: parseInt(viewX1),
                                        y1: parseInt(viewY1),
                                        x2: parseInt(viewX2),
                                        y2: parseInt(viewY2)
                                    }
                                };

                                // If this is our user data, resolve registration/login
                                if (userData.userId === this.userId) {
                                    if (this.registrationPromise) {
                                        this.registrationPromise.resolve(userData);
                                        this.registrationPromise = null;
                                    }
                                    if (this.loginPromise) {
                                        this.loginPromise.resolve(userData);
                                        this.loginPromise = null;
                                    }
                                    GameState.updateFromServer(userData);
                                } else {
                                    GameState.updatePlayer(userData);
                                }

                                break;
                            }
                            case 'userid': {
                                const userId = parseInt(args[0]);
                                console.log('Received userid:', userId);
                                this.userId = userId;
                                break;
                            }
                            case 'join': {
                                const userid = parseInt(args[0]);
                                const username = args[1];
                                console.log('User joined:', { userid, username });
                                break;
                            }
                            case 'reset': {
                                this.onReset();
                                break;
                            }
                            default:
                                console.warn(`Unknown command received: ${command}`);
                        }
                    } catch (error) {
                        console.error('Error processing message:', error);
                        this.onError(new Error(`Failed to process server message: ${error.message}`));
                    }
                };

                this.ws.onopen = () => {
                    clearTimeout(timeout);
                    this.connected = true;
                    console.log(`Connected to ${this.serverUrl}`);
                    // Request initial grid state
                    this.ws.send('grid');
                    resolve(true);
                };

                this.ws.onerror = (error) => {
                    clearTimeout(timeout);
                    const errorMsg = `WebSocket error. Make sure the server is running at ${this.serverUrl}`;
                    console.error(errorMsg, error);
                    this.onError(new Error(errorMsg));
                    if (this.registrationPromise) {
                        this.registrationPromise.reject(new Error(errorMsg));
                        this.registrationPromise = null;
                    }
                    if (this.loginPromise) {
                        this.loginPromise.reject(new Error(errorMsg));
                        this.loginPromise = null;
                    }
                    reject(error);
                };

                this.ws.onclose = () => {
                    this.connected = false;
                    const msg = "Connection closed";
                    console.log(msg);
                    if (this.registrationPromise) {
                        this.registrationPromise.reject(new Error(msg));
                        this.registrationPromise = null;
                    }
                    if (this.loginPromise) {
                        this.loginPromise.reject(new Error(msg));
                        this.loginPromise = null;
                    }
                    this.onError(new Error(msg));
                };
            });
        } catch (error) {
            const msg = `Failed to create WebSocket connection: ${error.message}`;
            console.error(msg);
            this.onError(new Error(msg));
            return false;
        }
    }

    async disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
            this.connected = false;
        }
    }

    async registerPlayer(name) {
        if (!this.connected) throw new Error("Not connected");

        // Create a promise that will be resolved when we receive our user data
        this.registrationPromise = {};
        const promise = new Promise((resolve, reject) => {
            this.registrationPromise.resolve = resolve;
            this.registrationPromise.reject = reject;
        });

        // Set a timeout
        const timeout = setTimeout(() => {
            if (this.registrationPromise) {
                this.registrationPromise.reject(new Error("Registration timeout"));
                this.registrationPromise = null;
            }
        }, 5000);

        try {
            // Find indices of selected color and avatar
            const colorIndex = GameState.colors.indexOf(GameState.currentUser.color);
            const avatarIndex = GameState.avatars.indexOf(GameState.currentUser.avatar);

            if (colorIndex === -1 || avatarIndex === -1) {
                throw new Error("Invalid color or avatar selected");
            }

            console.log('Registering player:', name, colorIndex, avatarIndex);
            this.ws.send(`register ${name} ${colorIndex} ${avatarIndex}`);
            const userData = await promise;  // Wait for user data
            clearTimeout(timeout);
            console.log('Player registered successfully:', userData);
            return userData;
        } catch (error) {
            clearTimeout(timeout);
            this.registrationPromise = null;
            console.error('Registration failed:', error);
            throw error;
        }
    }

    async loginPlayer(username) {
        if (!this.connected) throw new Error("Not connected");

        // Create a promise that will be resolved when we receive our user data
        this.loginPromise = {};
        const promise = new Promise((resolve, reject) => {
            this.loginPromise.resolve = resolve;
            this.loginPromise.reject = reject;
        });

        // Set a timeout
        const timeout = setTimeout(() => {
            if (this.loginPromise) {
                this.loginPromise.reject(new Error("Login timeout"));
                this.loginPromise = null;
            }
        }, 5000);

        try {
            console.log('Logging in player:', username);
            this.ws.send(`login ${username}`);
            const userData = await promise;  // Wait for user data
            clearTimeout(timeout);
            console.log('Player logged in successfully:', userData);
            return userData;
        } catch (error) {
            clearTimeout(timeout);
            this.loginPromise = null;
            console.error('Login failed:', error);
            throw error;
        }
    }

    async sendSettings(colorIndex, emojiIndex) {
        if (!this.connected) throw new Error("Not connected");
        if (!this.userId) throw new Error("Must login first");

        console.log('Sending settings:', colorIndex, emojiIndex);
        this.ws.send(`settings ${colorIndex} ${emojiIndex}`);
    }

    async openCell(x, y) {
        if (!this.connected) throw new Error("Not connected");
        return new Promise((resolve, reject) => {
            try {
                this.ws.send(`open ${x} ${y}`);
                // The server will send an 'update' message if successful
                resolve(true);
            } catch (error) {
                reject(error);
            }
        });
    }

    async markCell(x, y) {
        if (!this.connected) throw new Error("Not connected");
        return new Promise((resolve, reject) => {
            try {
                this.ws.send(`mark ${x} ${y}`);
                // The server will send an 'update' message if successful
                resolve(true);
            } catch (error) {
                reject(error);
            }
        });
    }

    getGridInfo() {
        return this.gridInfo;
    }
} 