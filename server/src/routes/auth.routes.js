import express from "express";
import crypto from "crypto";

import { requireAuth } from "../middleware/auth.middleware.js";

const router = express.Router();


// @route   GET /auth/login
// @desc    Redirect to OIDC provider
router.get("/login", (req, res) => {
  const state = crypto.randomUUID();
  const nonce = crypto.randomUUID();

  req.session.oidcState = state;
  req.session.oidcNonce = nonce;

  const authUrl =
    `${process.env.DWAAR_AUTHORIZATION_ENDPOINT}?` +
    `client_id=${encodeURIComponent(process.env.DWAAR_CLIENT_ID)}&` +
    `redirect_uri=${encodeURIComponent(process.env.DWAAR_REDIRECT_URI)}&` +
    `response_type=code&` +
    `scope=${encodeURIComponent("openid profile email")}&` +
    `state=${encodeURIComponent(state)}&` +
    `nonce=${encodeURIComponent(nonce)}`;

  return res.redirect(authUrl);
});

router.get("/callback", async (req, res) => {
  const { code, state } = req.query;

  if (!code || !state) {
    return res.status(400).json({
      message: "Missing code or state in callback.",
    });
  }

  if (state !== req.session.oidcState) {
    return res.status(400).json({
      message: "Invalid state.",
    });
  }

  try {
    const tokenResponse = await fetch(process.env.DWAAR_TOKEN_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code,
        client_id: process.env.DWAAR_CLIENT_ID,
        client_secret: process.env.DWAAR_CLIENT_SECRET,
        redirect_uri: process.env.DWAAR_REDIRECT_URI,
      }),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok || !tokenData.access_token) {
      return res.status(401).json({
        message: "Token exchange failed.",
        details: tokenData,
      });
    }

    const userInfoResponse = await fetch(process.env.DWAAR_USERINFO_ENDPOINT, {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    const userInfo = await userInfoResponse.json();

    if (!userInfoResponse.ok) {
      return res.status(401).json({
        message: "Failed to fetch user info.",
        details: userInfo,
      });
    }

    req.session.user = userInfo;
    req.session.accessToken = tokenData.access_token;
    req.session.refreshToken = tokenData.refresh_token;

    const clientUrl = process.env.CLIENT_APP_URL || "http://localhost:8000/";
    return res.redirect(clientUrl);
  } catch (error) {
    return res.status(500).json({
      message: "Authentication callback failed.",
      error: error.message,
    });
  }
});

// @route   GET / POST /auth/logout
// @desc    Logout user
const handleLogout = (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: "Logout failed" });
    }

    res.clearCookie("connect.sid");

    if (req.method === "GET") {
      const clientUrl =
        process.env.CLIENT_APP_URL
          ? `${process.env.CLIENT_APP_URL}/login.html`
          : "http://localhost:8000/login.html";
      return res.redirect(clientUrl);
    }

    return res.json({
      message: "Logged out successfully",
    });
  });
};

router.get("/logout", handleLogout);
router.post("/logout", handleLogout);

// @route   GET /me
// @desc    Get current user info
router.get("/me", requireAuth, (req, res) => {
  res.json({
    authenticated: true,
    user: req.session.user,
  });
});

export default router;
