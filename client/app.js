

class LocationTracker {
    constructor() {
        this.socket = null;
        this.map = null;
        this.userMarkers = new Map(); 

        this.isTracking = false;
        this.currentUserId = null;
        this.watchId = null;
        this.users = new Map(); // userId -> user data
        this.currentUser = null; // Authenticated user

        this.LOCATION_UPDATE_INTERVAL = 5000; // 5 seconds
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
            authBtn: document.getElementById('auth-btn'),
            userInfo: document.getElementById('user-info'),
        };

        this.init();
    }


    async init() {
        try {
            // Check authentication first
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
                credentials: 'include', // Include cookies for session
            });

            if (response.ok) {
                const data = await response.json();
                this.currentUser = data.user;
                this.updateAuthUI();
            } else if (response.status === 401) {
                // Not authenticated, redirect to login
                console.log('Not authenticated, redirecting to login...');
                this.redirectToLogin();
            } else {
                throw new Error(`Auth check failed: ${response.status}`);
            }
        } catch (error) {
            console.error('Auth check error:', error);
            this.redirectToLogin();
        }
    }

    redirectToLogin() {
        window.location.href = `${this.BACKEND_URL}/auth/login`;
    }

    logout() {
        fetch(`${this.BACKEND_URL}/auth/logout`, {
            credentials: 'include',
        })
        .then(() => {
            window.location.href = '/';
        })
        .catch(error => {
            console.error('Logout error:', error);
            window.location.href = '/';
        });
    }

    updateAuthUI() {
        if (this.currentUser && this.elements.userInfo) {
            this.elements.userInfo.textContent = `Logged in as: ${this.currentUser.name || this.currentUser.email}`;
            this.elements.userInfo.style.display = 'block';
        }

        if (this.elements.authBtn) {
            this.elements.authBtn.textContent = 'Logout';
            this.elements.authBtn.onclick = () => this.logout();
        }
    }

    validateSetup() {
        if (!navigator.geolocation) {
            throw new Error('Geolocation is not supported by your browser.');
        }
    }

    getBackendUrl() {
        // Production
        if (window.location.hostname !== 'localhost') {
            return 'https://trackkar-server.onrender.com';
        }
        // Local dev
        return 'http://localhost:5000';
    }

    getJwtToken() {
        const token = localStorage.getItem('jwt_token') ||
            sessionStorage.getItem('jwt_token') ||
            this.getUrlParameter('token');

        if (!token) {
            console.warn('No JWT token found. Session-based auth will be used.');
        }

        return token;
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
            withCredentials: true, // Include cookies for session
        };

        if (this.JWT_TOKEN) {
            socketOptions.auth = { token: this.JWT_TOKEN };
        }

        this.socket = io(this.BACKEND_URL, socketOptions);

        // Connection events
        this.socket.on('connect', () => this.onSocketConnect());
        this.socket.on('disconnect', () => this.onSocketDisconnect());
        this.socket.on('connect_error', (error) => this.onSocketError(error));

        // Location events
        this.socket.on('receive-location', (data) => this.onReceiveLocation(data));
    }

    onSocketConnect() {
        console.log('Socket.IO connected:', this.socket.id);
        // Use authenticated user's sub (subject) if available, otherwise socket.id
        this.currentUserId = this.currentUser?.sub || this.socket.id;
        this.updateConnectionStatus(true);
        this.showNotification('Connected to server', 'success');
    }

    onSocketDisconnect() {
        console.log('Socket.IO disconnected');
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
        if (this.isTracking) return;

        try {
            // Request geolocation permission
            const position = await this.getCurrentLocation();

            this.isTracking = true;
            this.updateTrackingUI();
            this.showNotification('Location tracking started', 'success');

            // Send initial location
            this.sendLocation(position.coords.latitude, position.coords.longitude);

            // Set up continuous updates
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
            console.warn('Socket not connected, cannot send location');
            return;
        }

        this.socket.emit('send-location', {
            latitude,
            longitude,
        });

        console.log(`Location sent: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
    }

    stopTracking() {
        if (!this.isTracking) return;

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

        // Update user data
        this.users.set(userId, {
            userId,
            latitude,
            longitude,
            timeStamp,
        });

        // Update map marker
        this.updateMarker(userId, latitude, longitude);

        // Update UI
        this.updateUsersList();
        this.updateLastUpdateTime();

        console.log(`Location received from ${userId}: ${latitude}, ${longitude}`);
    }

    updateMarker(userId, latitude, longitude) {
        // Remove old marker if exists
        if (this.userMarkers.has(userId)) {
            this.map.removeLayer(this.userMarkers.get(userId));
        }

        // Create new marker with custom icon
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

        if (this.isTracking) {
            startBtn.disabled = true;
            stopBtn.disabled = false;
        } else {
            startBtn.disabled = false;
            stopBtn.disabled = true;
        }
    }

    updateUsersList() {
        const { usersList, totalUsers } = this.elements;

        // Update total users count
        totalUsers.textContent = this.users.size;

        // Clear and rebuild users list
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
        const { lastUpdate } = this.elements;
        lastUpdate.textContent = new Date().toLocaleTimeString();
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

        // Auto-hide after 4 seconds
        setTimeout(() => {
            notification.classList.add('hidden');
        }, 4000);
    }



    setupEventListeners() {
        const { startBtn, stopBtn, authBtn } = this.elements;

        startBtn.addEventListener('click', () => this.startTracking());
        stopBtn.addEventListener('click', () => this.stopTracking());
        
        if (authBtn) {
            authBtn.addEventListener('click', () => this.logout());
        }

        // Handle page unload
        window.addEventListener('beforeunload', () => {
            this.stopTracking();
            if (this.socket) {
                this.socket.disconnect();
            }
        });
    }
}


document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing Location Tracker...');
    new LocationTracker();
});
