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
    return Boolean(localStorage.getItem('jwt_token') || sessionStorage.getItem('jwt_token'));
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

// Redirect to backend OIDC login if not authenticated
function requireAuth() {
    if (!isAuthenticated()) {
        window.location.href = `${getBackendUrl()}/auth/login`;
    }
}

// The backend now handles the OIDC callback and session creation.
// This page only needs to start the login redirect.
function handleAuthCallback() {
    window.location.href = '/';
}

async function loginWithDwaar() {
    try {
        const currentPage = window.location.pathname + window.location.search;
        const returnTo = encodeURIComponent(currentPage);
        window.location.href = `${getBackendUrl()}/auth/login?returnTo=${returnTo}`;
    } catch (error) {
        console.error('Unable to start login:', error);
        alert('Unable to load login configuration. Please try again.');
    }
}

// Logout
function logout() {
    localStorage.removeItem('jwt_token');
    sessionStorage.removeItem('jwt_token');
    window.location.href = `${getBackendUrl()}/auth/logout`;
}

// Auto-handle callback on load
if (getUrlParameter('code') || window.location.pathname === '/auth/callback') {
    handleAuthCallback();
}
