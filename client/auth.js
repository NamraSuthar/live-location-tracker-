function getBackendUrl() {
    if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
        return "http://localhost:5000";
    }

    return "https://trackkar-server.onrender.com";
}

async function getCurrentUser() {
    const response = await fetch(`${getBackendUrl()}/auth/me`, {
        credentials: "include",
    });

    if (!response.ok) {
        return null;
    }

    const data = await response.json();
    return data.user ?? null;
}

async function isAuthenticated() {
    const user = await getCurrentUser();
    return Boolean(user);
}

async function requireAuth() {
    const authenticated = await isAuthenticated();

    if (!authenticated) {
        window.location.href = "/login.html";
    }
}

function loginWithDwaar() {
    window.location.href = `${getBackendUrl()}/auth/login`;
}

async function logout() {
    await fetch(`${getBackendUrl()}/auth/logout`, {
        method: "POST",
        credentials: "include",
    });

    window.location.href = "/login.html";
}