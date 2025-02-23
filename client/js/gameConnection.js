// Base class for game connections
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
        this.onUpdate = (state, x, y, userId) => {
            PlayScreen.processServerUpdate({ x, y, state, userId });
        };
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

                        switch (command) {
                            case 'grid': {
                                const [width, height] = args.map(Number);
                                this.gridInfo = { width, height };  // Store grid info
                                this.onGridInfo(width, height);
                                break;
                            }
                            case 'update': {
                                const [state, x, y, userId] = args.map(Number);
                                console.log('Parsed update message:', { state, x, y, userId });
                                this.onUpdate(state, x, y, userId);
                                break;
                            }
                            case 'user': {
                                const [userId, name, colorIndex, avatarIndex, score, viewX1, viewY1, viewX2, viewY2] = args;
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
                            case 'score': {
                                const [score, x, y] = args.map(Number);
                                // Update the user's score in GameState
                                if (this.userId) {
                                    const userData = {
                                        ...GameState.currentUser,
                                        score: (GameState.currentUser.score || 0) + score
                                    };
                                    GameState.updateFromServer(userData);
                                }
                                break;
                            }
                            default:
                                console.warn(`Unknown command received: ${command}`);
                        }
                    } catch (error) {
                        console.error('Error processing message:', error);
                        console.error('Raw message:', event.data);
                        this.onError(new Error(`Failed to process server message: ${error.message}`));
                    }
                };

                this.ws.onopen = () => {
                    clearTimeout(timeout);
                    this.connected = true;
                    console.log(`Connected to ${this.serverUrl}`);
                    // Fix: Request initial grid state after connection
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

            // Fix: Request grid info after registration
            this.ws.send('grid');

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

    async act(action, x, y) {
        if (!this.connected) throw new Error("Not connected");
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(`act ${action} ${x} ${y}`);
        } else {
            throw new Error("WebSocket not open");
        }
    }

    async openCell(x, y) {
        return this.act(1, x, y); // OPEN = 1
    }

    async markCell(x, y) {
        return this.act(2, x, y); // MARK = 2
    }

    async unmarkCell(x, y) {
        return this.act(3, x, y); // UNMARK = 3
    }

    getGridInfo() {
        return this.gridInfo;
    }
} 