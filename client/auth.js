// Auth configuration
let AUTH_CONFIG = null;

function getBackendUrl() {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return 'http://localhost:5000';
    }

    return 'https://trackkar-server.onrender.com';
}

async function getAuthConfig() {
    if (AUTH_CONFIG) {
        return AUTH_CONFIG;
    }

    const response = await fetch(`${getBackendUrl()}/auth/config`);

    if (!response.ok) {
        throw new Error(`Unable to load auth config (${response.status})`);
    }

    AUTH_CONFIG = await response.json();

    return AUTH_CONFIG;
}

// Check if user is authenticated
function isAuthenticated() {
    return localStorage.getItem('jwt_token') || sessionStorage.getItem('jwt_token');
}

// Get JWT token
function getJwtToken() {
    return localStorage.getItem('jwt_token') ||
           sessionStorage.getItem('jwt_token') ||
           getUrlParameter('token');
}

// Get URL parameter
function getUrlParameter(name) {
    const url = new URL(window.location);
    return url.searchParams.get(name);
}

// Redirect to login if not authenticated
function requireAuth() {
    if (!isAuthenticated()) {
        window.location.href = '/login.html';
    }
}

// Handle OAuth callback
async function handleAuthCallback() {
    const code = getUrlParameter('code');
    const state = getUrlParameter('state');

    if (code) {
        try {
            const authConfig = await getAuthConfig();

            // Exchange code for token
            const response = await fetch(authConfig.tokenEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    grant_type: 'authorization_code',
                    code: code,
                    client_id: authConfig.clientId,
                    redirect_uri: authConfig.redirectUri
                })
            });

            const data = await response.json();

            if (data.access_token) {
                // Store token
                localStorage.setItem('jwt_token', data.access_token);

                // Clean URL and redirect to app
                window.history.replaceState({}, document.title, '/');
                window.location.href = '/';
            }
        } catch (error) {
            console.error('Auth error:', error);
            alert('Authentication failed. Please try again.');
            window.location.href = '/login.html';
        }
    }
}

async function loginWithDwaar() {
    try {
        const authConfig = await getAuthConfig();

        const authUrl = `${authConfig.authorizationEndpoint}?` +
            `client_id=${encodeURIComponent(authConfig.clientId)}&` +
            `redirect_uri=${encodeURIComponent(authConfig.redirectUri)}&` +
            `response_type=code&` +
            `scope=openid profile email`;

        window.location.href = authUrl;
    } catch (error) {
        console.error('Unable to start login:', error);
        alert('Unable to load login configuration. Please try again.');
    }
}

// Logout
function logout() {
    localStorage.removeItem('jwt_token');
    sessionStorage.removeItem('jwt_token');
    window.location.href = '/login.html';
}

// Auto-handle callback on load
if (getUrlParameter('code') || window.location.pathname === '/auth/callback') {
    handleAuthCallback();
}
