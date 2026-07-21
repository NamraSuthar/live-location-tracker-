import "dotenv/config";
import http from "http";
import express from "express";
import cors from "cors";
import session from "express-session";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";

import healthRouter from "./routes/health.routes.js";
import authRouter from "./routes/auth.routes.js";
import { notFoundHandler } from "./middleware/notFound.middleware.js";
import { errorHandler } from "./middleware/error.middleware.js";
import { socketAuthMiddleware } from "./sockets/auth.socket.js";
import { connectProducer } from "./kafka/producer.js";
import { connectConsumer, runConsumer } from "./kafka/consumer.js";
import { producer } from "./kafka/producer.js";
import { startDBConsumer } from "./kafka/dbConsumer.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const START_PORT = Number(process.env.PORT ?? 5000);

const server = http.createServer(app);

// Configure express-session middleware
const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || "dev-secret-change-this",
  resave: false,
  saveUninitialized: true,
  cookie: {
    secure: process.env.NODE_ENV === "production", // HTTPS only in production
    httpOnly: true,
    sameSite: "lax",
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  },
});

// Apply CORS middleware
app.use(
  cors({
    origin: [
      "http://localhost:8000",
      "http://localhost:3000",
      "https://trackkar-client.onrender.com",
    ],
    credentials: true,
  }),
);

app.use(express.json());
app.use(sessionMiddleware);

// Serve static files from client directory
app.use(express.static(path.join(__dirname, "../../client")));

// Configure Socket.IO server
const io = new Server(server, {
  cors: {
    origin: [
      "http://localhost:8000",
      "http://localhost:3000",
      "https://trackkar-client.onrender.com",
    ],
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// Bind session middleware to Socket.IO requests
io.use((socket, next) => {
  sessionMiddleware(socket.request, {}, next);
});

// Apply socket authentication middleware
io.use(socketAuthMiddleware);

const userSocketMap = new Map();

io.on("connection", (socket) => {
  const userId = socket.user?.sub;
  if (!userId) {
    console.log("Unauthorized socket connection attempt rejected");
    socket.disconnect();
    return;
  }

  userSocketMap.set(userId, socket.id);
  console.log("Authenticated socket connection:", socket.id, "User:", userId);

  socket.on("disconnect", () => {
    userSocketMap.delete(userId);
    console.log("Socket disconnected:", socket.id);
  });

  socket.on("send-location", async (data) => {
    try {
      const senderUserId = socket.user.sub;

      const locationEvent = {
        userId: senderUserId,
        latitude: data.latitude,
        longitude: data.longitude,
        timeStamp: Date.now(),
      };

      // Broadcast to all connected clients
      io.emit("receive-location", locationEvent);

      // Stream to Kafka if available
      try {
        await producer.send({
          topic: "location-update",
          messages: [
            {
              key: senderUserId,
              value: JSON.stringify(locationEvent),
            },
          ],
        });
      } catch (kafkaErr) {
        // Kafka broadcast fallback handled
      }
    } catch (error) {
      console.error("Error sending location:", error.message);
    }
  });
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../../client/index.html"));
});

app.use("/health", healthRouter);
app.use("/auth", authRouter);

app.use(notFoundHandler);
app.use(errorHandler);

const startServer = async () => {
  const listenOnPort = (port) =>
    new Promise((resolve, reject) => {
      const onError = (err) => {
        server.off("listening", onListening);
        reject(err);
      };

      const onListening = () => {
        server.off("error", onError);
        resolve(port);
      };

      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(port);
    });

  let activePort = START_PORT;

  for (let attempts = 0; attempts <= 10; attempts += 1) {
    try {
      activePort = await listenOnPort(activePort);
      console.log(`server running on http://localhost:${activePort}`);
      break;
    } catch (err) {
      if (err.code === "EADDRINUSE" && attempts < 10) {
        console.error(
          `Port ${activePort} is already in use, trying ${activePort + 1}`,
        );
        activePort += 1;
        continue;
      }

      console.error("Server error", err);
      throw err;
    }
  }

  // Initialize Kafka in background
  if (process.env.KAFKA_BROKER) {
    await connectProducer().catch((err) =>
      console.warn("Producer init warning:", err.message),
    );
    await connectConsumer().catch((err) =>
      console.warn("Consumer init warning:", err.message),
    );
    await runConsumer(io).catch((err) =>
      console.warn("Consumer run warning:", err.message),
    );
    await startDBConsumer().catch((err) =>
      console.warn("DB Consumer warning:", err.message),
    );
  } else {
    console.log("Kafka not configured - using direct Socket.IO broadcast");
  }
};

startServer();
