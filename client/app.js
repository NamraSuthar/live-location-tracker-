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
        this.updateCounter = 0;
        this.lastPosition = null;

        this.BACKEND_URL = this.getBackendUrl();

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
            hudCoordinates: document.getElementById('hud-coordinates'),
            recenterBtn: document.getElementById('recenter-map-btn'),
            trackingStateBadge: document.getElementById('tracking-state-badge'),
            activeCountBadge: document.getElementById('active-count-badge'),
            updateCount: document.getElementById('update-count'),
            streamStatus: document.getElementById('stream-status'),
        };

        this.init();
    }

    async init() {
        try {
            const isAuthenticated = await this.checkAuth();

            if (!isAuthenticated) {
                this.updateConnectionStatus(false);
                this.showNotification('Please login to continue', 'error');
                return;
            }

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

            console.log('Auth check response:', response.status);

            if (response.ok) {
                const data = await response.json();
                console.log('User authenticated:', data.user);
                this.currentUser = data.user;
                this.updateAuthUI();
                return true;
            }

            if (response.status === 401) {
                console.log('User not authenticated (401)');
                this.currentUser = null;
                this.showLoginButton();
                return false;
            }

            throw new Error(`Auth check failed: ${response.status}`);
        } catch (error) {
            console.error('Auth check error:', error);
            this.currentUser = null;
            this.showLoginButton();
            return false;
        }
    }

    redirectToLogin() {
        window.location.href = `${this.BACKEND_URL}/auth/login`;
    }

    logout() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }

        fetch(`${this.BACKEND_URL}/auth/logout`, {
            method: 'GET',
            credentials: 'include',
        }).finally(() => {
            this.currentUser = null;
            window.location.href = '/login.html';
        });
    }

    updateAuthUI() {
        const userInfo = this.elements.userInfo;

        if (!userInfo || !this.currentUser) {
            return;
        }

        const userName = this.currentUser.name || this.currentUser.email || 'User';
        const initial = userName.charAt(0).toUpperCase();

        userInfo.innerHTML = `
            <div class="user-info-content">
                <div class="user-avatar">${initial}</div>
                <span class="user-name">${userName}</span>
                <button id="logout-btn" class="btn-logout" type="button">Logout</button>
            </div>
        `;
        userInfo.style.display = 'flex';

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

    initializeMap() {
        return new Promise((resolve, reject) => {
            try {
                this.map = L.map('map', {
                    zoomControl: true,
                }).setView([20, 0], 3);

                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '© OpenStreetMap contributors | TrackKar Radar',
                    maxZoom: 19,
                    minZoom: 2,
                }).addTo(this.map);

                setTimeout(() => {
                    if (this.map) {
                        this.map.invalidateSize();
                    }
                }, 200);

                resolve();
            } catch (error) {
                reject(new Error(`Map initialization failed: ${error.message}`));
            }
        });
    }

    setupSocketIO() {
        if (!this.currentUser) {
            return;
        }

        const socketOptions = {
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            reconnectionAttempts: 5,
            withCredentials: true,
        };

        this.socket = io(this.BACKEND_URL, socketOptions);
        this.socket.on('connect', () => this.onSocketConnect());
        this.socket.on('disconnect', () => this.onSocketDisconnect());
        this.socket.on('connect_error', (error) => this.onSocketError(error));
        this.socket.on('receive-location', (data) => this.onReceiveLocation(data));
    }

    onSocketConnect() {
        this.currentUserId = this.currentUser?.sub || this.socket.id;
        this.updateConnectionStatus(true);
        if (this.elements.streamStatus) {
            this.elements.streamStatus.textContent = 'CONNECTED';
            this.elements.streamStatus.style.color = '#10b981';
        }
        this.showNotification('Connected to Socket.IO telemetry stream', 'success');
    }

    onSocketDisconnect() {
        this.updateConnectionStatus(false);
        this.stopTracking();
        if (this.elements.streamStatus) {
            this.elements.streamStatus.textContent = 'DISCONNECTED';
            this.elements.streamStatus.style.color = '#ef4444';
        }
        this.showNotification('Disconnected from socket server', 'error');
    }

    onSocketError(error) {
        console.error('Socket.IO error:', error);
        this.updateConnectionStatus(false);
        this.showNotification(`Socket error: ${error.message}`, 'error');
    }

    async startTracking() {
        if (this.isTracking) {
            return;
        }

        try {
            const position = await this.getCurrentLocation();
            this.isTracking = true;
            this.lastPosition = position.coords;
            
            this.updateTrackingUI();
            this.updateHUDCoordinates(position.coords.latitude, position.coords.longitude);
            
            this.map.flyTo([position.coords.latitude, position.coords.longitude], 15, {
                animate: true,
                duration: 1.5,
            });

            this.showNotification('Live location broadcasting active', 'success');
            this.sendLocation(position.coords.latitude, position.coords.longitude);

            this.watchId = navigator.geolocation.watchPosition(
                (position) => {
                    const { latitude, longitude } = position.coords;
                    this.lastPosition = position.coords;
                    this.updateHUDCoordinates(latitude, longitude);
                    this.sendLocation(latitude, longitude);
                },
                (error) => {
                    console.error('Geolocation error:', error);
                    this.showNotification(`GPS error: ${error.message}`, 'error');
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

        this.updateCounter++;
        if (this.elements.updateCount) {
            this.elements.updateCount.textContent = this.updateCounter;
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
        this.showNotification('Location broadcasting paused', 'success');
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

        const isCurrent = userId === this.currentUserId;
        const icon = this.createMarkerIcon(isCurrent);
        const marker = L.marker([latitude, longitude], { icon })
            .bindPopup(this.createPopupContent(userId, latitude, longitude))
            .addTo(this.map);

        this.userMarkers.set(userId, marker);
    }

    createMarkerIcon(isCurrent) {
        const svgIcon = isCurrent
            ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="32" height="32"><rect x="4" y="4" width="16" height="16" fill="#000000" stroke="#000000" stroke-width="2"/><circle cx="12" cy="12" r="3" fill="#ffffff"/></svg>`
            : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="32" height="32"><rect x="4" y="4" width="16" height="16" fill="#ffffff" stroke="#000000" stroke-width="3"/><rect x="9" y="9" width="6" height="6" fill="#000000"/></svg>`;

        return L.icon({
            iconUrl: `data:image/svg+xml;base64,${btoa(svgIcon)}`,
            iconSize: [32, 32],
            iconAnchor: [16, 16],
            popupAnchor: [0, -16],
        });
    }

    createPopupContent(userId, latitude, longitude) {
        const isCurrentUser = userId === this.currentUserId;
        const label = isCurrentUser ? 'YOU (CURRENT DEVICE)' : `USER: ${userId.substring(0, 8)}`;

        return `
            <div style="font-family: sans-serif; text-align: center; min-width: 140px; padding: 4px;">
                <strong style="color: #000000; font-size: 0.85rem; text-transform: uppercase;">${label}</strong><br/>
                <span style="font-size: 0.8rem; color: #333333; font-family: monospace; font-weight: bold;">
                    ${latitude.toFixed(5)}, ${longitude.toFixed(5)}
                </span>
            </div>
        `;
    }

    updateConnectionStatus(connected) {
        const statusDot = this.elements.statusDot;
        const statusText = this.elements.statusText;

        if (connected) {
            statusDot.classList.remove('disconnected');
            statusDot.classList.add('connected');
            statusText.textContent = 'Live Connected';
        } else {
            statusDot.classList.remove('connected');
            statusDot.classList.add('disconnected');
            statusText.textContent = 'Disconnected';
        }
    }

    updateTrackingUI() {
        const { startBtn, stopBtn, trackingStateBadge } = this.elements;
        startBtn.disabled = this.isTracking;
        stopBtn.disabled = !this.isTracking;

        if (trackingStateBadge) {
            if (this.isTracking) {
                trackingStateBadge.textContent = 'Broadcasting';
                trackingStateBadge.style.background = 'rgba(16, 185, 129, 0.15)';
                trackingStateBadge.style.color = '#10b981';
            } else {
                trackingStateBadge.textContent = 'Offline';
                trackingStateBadge.style.background = 'rgba(255, 255, 255, 0.06)';
                trackingStateBadge.style.color = '#a1a1aa';
            }
        }
    }

    updateHUDCoordinates(lat, lng) {
        if (this.elements.hudCoordinates) {
            this.elements.hudCoordinates.textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        }
    }

    updateUsersList() {
        const { usersList, totalUsers, activeCountBadge } = this.elements;
        const count = this.users.size;

        if (totalUsers) totalUsers.textContent = count;
        if (activeCountBadge) activeCountBadge.textContent = `${count} Online`;

        usersList.innerHTML = '';

        if (count === 0) {
            usersList.innerHTML = `
                <div class="empty-state">
                    <span class="empty-icon">📡</span>
                    <p>No active users connected</p>
                </div>
            `;
            return;
        }

        this.users.forEach((user) => {
            const userCard = document.createElement('div');
            userCard.className = 'user-card';

            const isCurrentUser = user.userId === this.currentUserId;
            const label = isCurrentUser ? 'You' : `User ${user.userId.substring(0, 6)}`;
            const initial = isCurrentUser ? 'Y' : 'U';

            userCard.innerHTML = `
                <div class="user-card-info">
                    <div class="user-card-avatar">${initial}</div>
                    <div class="user-card-details">
                        <span class="user-card-name">${label}</span>
                        <span class="user-card-meta">${user.latitude.toFixed(4)}, ${user.longitude.toFixed(4)}</span>
                    </div>
                </div>
                <button class="user-card-action" type="button">Focus</button>
            `;

            const focusBtn = userCard.querySelector('.user-card-action');
            focusBtn.addEventListener('click', () => {
                this.map.flyTo([user.latitude, user.longitude], 16, { animate: true });
            });

            usersList.appendChild(userCard);
        });
    }

    updateLastUpdateTime() {
        if (this.elements.lastUpdate) {
            this.elements.lastUpdate.textContent = new Date().toLocaleTimeString();
        }
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
        const { startBtn, stopBtn, recenterBtn } = this.elements;

        startBtn.addEventListener('click', () => this.startTracking());
        stopBtn.addEventListener('click', () => this.stopTracking());

        if (recenterBtn) {
            recenterBtn.addEventListener('click', () => {
                if (this.lastPosition) {
                    this.map.flyTo([this.lastPosition.latitude, this.lastPosition.longitude], 16, { animate: true });
                } else {
                    this.getCurrentLocation().then(pos => {
                        this.lastPosition = pos.coords;
                        this.map.flyTo([pos.coords.latitude, pos.coords.longitude], 16, { animate: true });
                    }).catch(err => {
                        this.showNotification('Unable to fetch GPS position', 'error');
                    });
                }
            });
        }

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
