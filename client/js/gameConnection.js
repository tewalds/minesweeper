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
                        console.log('Received command:', command, 'args:', args);

                        switch (command) {
                            case 'grid': {
                                const [width, height, userId] = args.map(Number);
                                this.userId = userId;  // Store userId for later use
                                this.onGridInfo(width, height, userId);
                                break;
                            }
                            case 'update': {
                                const [state, x, y, updateUserId] = args.map(Number);
                                console.log('Update received:', { state, x, y, updateUserId });
                                this.onUpdate(state, x, y, updateUserId);
                                break;
                            }
                            case 'join': {
                                const [joinUserId, name] = [Number(args[0]), args[1]];
                                this.onPlayerJoin(joinUserId, name);
                                if (joinUserId === this.userId) {
                                    // Our registration completed
                                    if (this.registrationPromise) {
                                        this.registrationPromise.resolve();
                                        this.registrationPromise = null;
                                    }
                                }
                                break;
                            }
                            case 'reset':
                                this.onReset();
                                break;
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

        // Create a promise that will be resolved when we receive our join message
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
            console.log('Registering player:', name);
            this.ws.send(`register ${name}`);
            await promise;  // Wait for join message
            clearTimeout(timeout);
            console.log('Player registered successfully');
            return true;
        } catch (error) {
            clearTimeout(timeout);
            this.registrationPromise = null;
            console.error('Registration failed:', error);
            throw error;
        }
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
} 