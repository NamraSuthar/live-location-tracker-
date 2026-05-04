import jwt from "jsonwebtoken"
import jwksClient from "jwks-rsa"

const client = jwksClient({
    jwksUri: process.env.DWAAR_JWKS_URI
})

const getKey = (header,callback)=>{
    client.getSigningKey(header.kid, function(err,key){
        if(err) return callback(err)

            const signinKey = key.getPublicKey()
            callback(null, signinKey)
    })
}




export const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ message: "No token provided" });
  }

  const token = authHeader.split(" ")[1];

  jwt.verify(
    token,
    getKey,
    {
      issuer: process.env.DWAAR_ISSUER_URL,
      audience: process.env.DWAAR_CLIENT_ID,
    },
    (err, decoded) => {
      if (err) {
        return res.status(401).json({
          message: "Invalid token",
          error: err.message,
        });
      }

      // attach user
      req.user = decoded;

      next();
    }
  );
};

// Session-based authentication middleware
export const requireAuth = (req, res, next) => {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ message: "Unauthorized - please login first" });
  }

  next();
};