import jwt from "jsonwebtoken";
import jwksClient from "jwks-rsa";

const client = jwksClient({
  jwksUri: process.env.DWAAR_JWKS_URI,
});

const getKey = (header, callback) => {
  client.getSigningKey(header.kid, (err, key) => {
    const signingKey = key.getPublicKey();
    callback(null, signingKey);
  });
};

export const socketAuthMiddleware = (socket, next) => {
  const token = socket.handshake.auth?.token;

  // Dev mode - skip JWT if not provided
  if (!token) {
    socket.user = { sub: socket.id };
    return next();
  }

  jwt.verify(
    token,
    getKey,
    {
      issuer: process.env.DWAAR_ISSUER_URL,
      audience: process.env.DWAAR_CLIENT_ID,
    },
    (err, decoded) => {
      if (err) {
        return next(new Error("Invalid token"));
      }

      socket.user = decoded;

      next();
    }
  );
};