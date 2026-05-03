// Auth configuration
const AUTH_CONFIG = {
    dwaarUrl: process.env.DWAAR_ISSUER_URL, // Your Dwaar server URL
    clientId: process.env.DWAAR_CLIENT_ID, // Get from Dwaar
    redirectUri: window.location.origin + '/auth/callback'
};

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
            // Exchange code for token
            const response = await fetch(`${AUTH_CONFIG.dwaarUrl}/o/token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    grant_type: 'authorization_code',
                    code: code,
                    client_id: AUTH_CONFIG.clientId,
                    redirect_uri: AUTH_CONFIG.redirectUri
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

// Logout
function logout() {
    localStorage.removeItem('jwt_token');
    sessionStorage.removeItem('jwt_token');
    window.location.href = '/login.html';
}

// Auto-handle callback on load
if (window.location.pathname === '/auth/callback') {
    handleAuthCallback();
}
