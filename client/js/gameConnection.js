class GameConnection {
    constructor() {
        this.serverUrl = `ws://${window.location.host}/minefield`;
        this.ws = null;
        this.connected = false;
        this.registrationPromise = null;  // Track registration completion
        this.loginPromise = null;  // Track login completion
        this.gridInfo = null;  // Store grid info
        this.onError = (error) => { };
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
                                this.gridInfo = new Rect(new Point(0, 0), new Point(width, height));
                                break;
                            }
                            case 'update': {
                                const [state, x, y, userId] = args.map(Number);
                                PlayScreen.processUpdate(state, x, y,userId);
                                break;
                            }
                            case 'user': {
                                // console.log("Received user data:", args);
                                const [userId, name, colorIndex, avatarIndex, score, mouseX, mouseY, active] = args;
                                const userData = {
                                    userId: parseInt(userId),
                                    name,
                                    colorIndex: parseInt(colorIndex),
                                    color: GameState.colors[parseInt(colorIndex)] || GameState.defaultColor,
                                    avatarIndex: parseInt(avatarIndex),
                                    avatar: GameState.avatars[parseInt(avatarIndex)] || GameState.defaultAvatar,
                                    score: parseInt(score),
                                    mouse: new Point(parseInt(mouseX), parseInt(mouseY)),
                                    lastActive: Date.now() - 1000 * parseInt(active),
                                };
                                GameState.updatePlayer(userData);

                                if (userData.userId === this.userId) {
                                    if (this.registrationPromise) {
                                        this.registrationPromise.resolve(userData);
                                        this.registrationPromise = null;
                                    }
                                    if (this.loginPromise) {
                                        this.loginPromise.resolve(userData);
                                        this.loginPromise = null;
                                    }
                                }
                                break;
                            }
                            case 'userid': {
                                const userId = parseInt(args[0]);
                                console.log('Received userid:', userId);
                                this.userId = userId;
                                GameState.userid = userId;
                                break;
                            }
                            case 'reset': {
                                this.onReset();
                                break;
                            }
                            case 'score': {
                                const [delta, x, y] = args.map(Number);
                                GameState.players.get(this.userId).score += delta;
                                // TODO: Show a score effect at the x, y position.
                                break;
                            }
                            case 'mouse': {
                                const [userId, x, y] = args.map(Number);
                                // Update player mouse position
                                if (GameState.players.has(userId)) {
                                    GameState.players.get(userId).mouse = new Point(x, y);
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

    async sendView(x1, y1, x2, y2, force) {
        if (!this.connected) throw new Error("Not connected");
        if (!this.userId) throw new Error("Must login first");
        console.log('sending view:', x1, y1, x2, y2, force);
        this.ws.send(`view ${x1} ${y1} ${x2} ${y2} ${force ? 1 : 0}`)
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