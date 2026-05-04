class LocationTracker {
    constructor() {
        this.socket = null;
        this.map = null;
        this.userMarkers = new Map();
        this.users = new Map();

        this.isTracking = false;
        this.currentUserId = null;
        this.currentUser = null;
        this.watchId = null;

        this.BACKEND_URL = this.getBackendUrl();
        this.JWT_TOKEN = this.getJwtToken();

        this.elements = {
            map: document.getElementById('map'),
            startBtn: document.getElementById('start-tracking-btn'),
            stopBtn: document.getElementById('stop-tracking-btn'),
            statusDot: document.getElementById('connection-status'),
            statusText: document.getElementById('connection-text'),
            usersList: document.getElementById('users-list'),
            totalUsers: document.getElementById('total-users'),
            lastUpdate: document.getElementById('last-update'),
            notification: document.getElementById('notification'),
            userInfo: document.getElementById('user-info'),
        };

        this.init();
    }

    async init() {
        try {
            await this.checkAuth();
            this.validateSetup();
            await this.initializeMap();
            this.setupSocketIO();
            this.setupEventListeners();
            this.showNotification('Ready to start tracking', 'success');
        } catch (error) {
            console.error('Initialization failed:', error);
            this.showNotification(`Initialization failed: ${error.message}`, 'error');
        }
    }

    async checkAuth() {
        try {
            const response = await fetch(`${this.BACKEND_URL}/auth/me`, {
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                },
            });

            if (response.ok) {
                const data = await response.json();
                this.currentUser = data.user;
                this.updateAuthUI();
                return;
            }

            if (response.status === 401) {
                this.showLoginButton();
                return;
            }

            throw new Error(`Auth check failed: ${response.status}`);
        } catch (error) {
            console.error('Auth check error:', error);
            this.showLoginButton();
        }
    }

    redirectToLogin() {
        const returnTo = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.href = `${this.BACKEND_URL}/auth/login?returnTo=${returnTo}`;
    }

    logout() {
        fetch(`${this.BACKEND_URL}/auth/logout`, {
            credentials: 'include',
        }).finally(() => {
            window.location.href = '/';
        });
    }

    updateAuthUI() {
        const userInfo = this.elements.userInfo;

        if (!userInfo || !this.currentUser) {
            return;
        }

        const userName = this.currentUser.name || this.currentUser.email || 'User';
        userInfo.innerHTML = `
            <div class="user-info-content">
                <span class="user-name">${userName}</span>
                <button id="logout-btn" class="btn btn-logout" type="button">Logout</button>
            </div>
        `;
        userInfo.style.display = 'block';

        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => this.logout());
        }
    }

    showLoginButton() {
        const userInfo = this.elements.userInfo;

        if (!userInfo) {
            return;
        }

        userInfo.innerHTML = `
            <button id="login-btn" class="btn btn-secondary" type="button">Login</button>
        `;
        userInfo.style.display = 'block';

        const loginBtn = document.getElementById('login-btn');
        if (loginBtn) {
            loginBtn.addEventListener('click', () => this.redirectToLogin());
        }
    }

    validateSetup() {
        if (!navigator.geolocation) {
            throw new Error('Geolocation is not supported by your browser.');
        }
    }

    getBackendUrl() {
        if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
            return 'https://trackkar-server.onrender.com';
        }

        return 'http://localhost:5000';
    }

    getJwtToken() {
        return localStorage.getItem('jwt_token') ||
            sessionStorage.getItem('jwt_token') ||
            this.getUrlParameter('token');
    }

    getUrlParameter(name) {
        const url = new URL(window.location);
        return url.searchParams.get(name);
    }

    initializeMap() {
        return new Promise((resolve, reject) => {
            try {
                this.map = L.map('map').setView([20, 0], 2);

                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '© OpenStreetMap contributors',
                    maxZoom: 19,
                    minZoom: 2,
                }).addTo(this.map);

                this.elements.map.style.backgroundColor = '#f0f0f0';
                resolve();
            } catch (error) {
                reject(new Error(`Map initialization failed: ${error.message}`));
            }
        });
    }

    setupSocketIO() {
        const socketOptions = {
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            reconnectionAttempts: 5,
            withCredentials: true,
        };

        if (this.JWT_TOKEN) {
            socketOptions.auth = { token: this.JWT_TOKEN };
        }

        this.socket = io(this.BACKEND_URL, socketOptions);
        this.socket.on('connect', () => this.onSocketConnect());
        this.socket.on('disconnect', () => this.onSocketDisconnect());
        this.socket.on('connect_error', (error) => this.onSocketError(error));
        this.socket.on('receive-location', (data) => this.onReceiveLocation(data));
    }

    onSocketConnect() {
        this.currentUserId = this.currentUser?.sub || this.socket.id;
        this.updateConnectionStatus(true);
        this.showNotification('Connected to server', 'success');
    }

    onSocketDisconnect() {
        this.updateConnectionStatus(false);
        this.stopTracking();
        this.showNotification('Disconnected from server', 'error');
    }

    onSocketError(error) {
        console.error('Socket.IO error:', error);
        this.updateConnectionStatus(false);
        this.showNotification(`Connection error: ${error.message}`, 'error');
    }

    async startTracking() {
        if (this.isTracking) {
            return;
        }

        try {
            const position = await this.getCurrentLocation();
            this.isTracking = true;
            this.updateTrackingUI();
            this.showNotification('Location tracking started', 'success');
            this.sendLocation(position.coords.latitude, position.coords.longitude);

            this.watchId = navigator.geolocation.watchPosition(
                (position) => {
                    const { latitude, longitude } = position.coords;
                    this.sendLocation(latitude, longitude);
                },
                (error) => {
                    console.error('Geolocation error:', error);
                    this.showNotification(`Location error: ${error.message}`, 'error');
                    this.stopTracking();
                },
                {
                    enableHighAccuracy: true,
                    maximumAge: 0,
                    timeout: 30000,
                }
            );
        } catch (error) {
            console.error('Failed to start tracking:', error);
            this.showNotification(`Failed to start tracking: ${error.message}`, 'error');
        }
    }

    getCurrentLocation() {
        return new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: true,
                timeout: 30000,
                maximumAge: 0,
            });
        });
    }

    sendLocation(latitude, longitude) {
        if (!this.socket || !this.socket.connected) {
            return;
        }

        this.socket.emit('send-location', {
            latitude,
            longitude,
        });
    }

    stopTracking() {
        if (!this.isTracking) {
            return;
        }

        if (this.watchId !== null) {
            navigator.geolocation.clearWatch(this.watchId);
            this.watchId = null;
        }

        this.isTracking = false;
        this.updateTrackingUI();
        this.showNotification('Location tracking stopped', 'success');
    }

    onReceiveLocation(data) {
        const { userId, latitude, longitude, timeStamp } = data;

        this.users.set(userId, {
            userId,
            latitude,
            longitude,
            timeStamp,
        });

        this.updateMarker(userId, latitude, longitude);
        this.updateUsersList();
        this.updateLastUpdateTime();
    }

    updateMarker(userId, latitude, longitude) {
        if (this.userMarkers.has(userId)) {
            this.map.removeLayer(this.userMarkers.get(userId));
        }

        const icon = this.createMarkerIcon(userId === this.currentUserId);
        const marker = L.marker([latitude, longitude], { icon })
            .bindPopup(this.createPopupContent(userId, latitude, longitude))
            .addTo(this.map);

        this.userMarkers.set(userId, marker);
    }

    createMarkerIcon(isCurrent) {
        const svgIcon = isCurrent
            ? '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="black" width="24" height="24"><circle cx="12" cy="12" r="8"/><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z"/></svg>'
            : '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2" width="24" height="24"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2"/></svg>';

        return L.icon({
            iconUrl: `data:image/svg+xml;base64,${btoa(svgIcon)}`,
            iconSize: [32, 32],
            iconAnchor: [16, 16],
            popupAnchor: [0, -32],
        });
    }

    createPopupContent(userId, latitude, longitude) {
        const isCurrentUser = userId === this.currentUserId;
        const label = isCurrentUser ? 'You' : `User: ${userId.substring(0, 8)}...`;

        return `
            <div style="font-family: sans-serif; text-align: center; min-width: 150px;">
                <strong>${label}</strong><br/>
                <small>Lat: ${latitude.toFixed(6)}</small><br/>
                <small>Lng: ${longitude.toFixed(6)}</small>
            </div>
        `;
    }

    updateConnectionStatus(connected) {
        const statusDot = this.elements.statusDot;
        const statusText = this.elements.statusText;

        if (connected) {
            statusDot.classList.remove('disconnected');
            statusDot.classList.add('connected');
            statusText.textContent = 'Connected';
        } else {
            statusDot.classList.remove('connected');
            statusDot.classList.add('disconnected');
            statusText.textContent = 'Disconnected';
        }
    }

    updateTrackingUI() {
        const { startBtn, stopBtn } = this.elements;
        startBtn.disabled = this.isTracking;
        stopBtn.disabled = !this.isTracking;
    }

    updateUsersList() {
        const { usersList, totalUsers } = this.elements;
        totalUsers.textContent = this.users.size;
        usersList.innerHTML = '';

        if (this.users.size === 0) {
            usersList.innerHTML = '<p class="empty-state">No users connected</p>';
            return;
        }

        this.users.forEach((user) => {
            const userItem = document.createElement('div');
            userItem.className = 'user-item';

            const isCurrentUser = user.userId === this.currentUserId;
            const label = isCurrentUser ? 'You' : `User: ${user.userId.substring(0, 8)}...`;

            userItem.innerHTML = `
                <span class="user-name">${label}</span>
                <span class="user-distance">${this.getTimeAgo(user.timeStamp)}</span>
                <span class="user-status"></span>
            `;

            usersList.appendChild(userItem);
        });
    }

    updateLastUpdateTime() {
        this.elements.lastUpdate.textContent = new Date().toLocaleTimeString();
    }

    getTimeAgo(timestamp) {
        const now = Date.now();
        const seconds = Math.floor((now - timestamp) / 1000);

        if (seconds < 60) return 'now';
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        return `${days}d ago`;
    }

    showNotification(message, type = 'success') {
        const { notification } = this.elements;

        notification.textContent = message;
        notification.className = `notification ${type}`;
        notification.classList.remove('hidden');

        setTimeout(() => {
            notification.classList.add('hidden');
        }, 4000);
    }

    setupEventListeners() {
        const { startBtn, stopBtn } = this.elements;

        startBtn.addEventListener('click', () => this.startTracking());
        stopBtn.addEventListener('click', () => this.stopTracking());

        window.addEventListener('beforeunload', () => {
            this.stopTracking();
            if (this.socket) {
                this.socket.disconnect();
            }
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new LocationTracker();
});
