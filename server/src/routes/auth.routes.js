import express from "express";
import { Issuer } from "openid-client";
import { requireAuth } from "../middleware/auth.middleware.js";

const router = express.Router();

let client = null;

// Initialize OIDC client on first use
async function getOIDCClient() {
  if (client) {
    return client;
  }

  const issuer = await Issuer.discover(process.env.DWAAR_ISSUER_URL);
  
  client = new issuer.Client({
    client_id: process.env.DWAAR_CLIENT_ID,
    client_secret: process.env.DWAAR_CLIENT_SECRET,
    redirect_uris: [process.env.DWAAR_REDIRECT_URI],
    response_types: ["code"],
  });

  return client;
}

// @route   GET /auth/login
// @desc    Redirect to OIDC provider
router.get("/login", async (req, res) => {
  try {
    const oidcClient = await getOIDCClient();
    
    const authorizationUrl = oidcClient.authorizationUrl({
      scope: "openid profile email",
      state: Math.random().toString(36).substring(7),
      nonce: Math.random().toString(36).substring(7),
    });

    res.redirect(authorizationUrl);
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Login failed" });
  }
});

// @route   GET /auth/callback
// @desc    OIDC callback endpoint
router.get("/callback", async (req, res) => {
  try {
    const { code, state } = req.query;

    if (!code) {
      return res.status(400).json({ error: "No authorization code received" });
    }

    const oidcClient = await getOIDCClient();
    const params = new URLSearchParams({
      code,
      state,
      redirect_uri: process.env.DWAAR_REDIRECT_URI,
    });

    // Exchange code for tokens
    const tokenSet = await oidcClient.callback(
      process.env.DWAAR_REDIRECT_URI,
      { code, state }
    );

    // Get user info
    const userInfo = await oidcClient.userinfo(tokenSet);

    // Store in session
    req.session.user = {
      sub: userInfo.sub,
      email: userInfo.email,
      name: userInfo.name,
    };

    req.session.tokens = {
      accessToken: tokenSet.access_token,
      refreshToken: tokenSet.refresh_token,
    };

    res.redirect("/");
  } catch (error) {
    console.error("Callback error:", error);
    res.status(500).json({ error: "Callback failed" });
  }
});

// @route   GET /auth/logout
// @desc    Logout user
router.get("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: "Logout failed" });
    }
    res.redirect("/");
  });
});

// @route   GET /me
// @desc    Get current user info
router.get("/me", requireAuth, (req, res) => {
  res.json({
    user: req.session.user,
  });
});

export default router;
