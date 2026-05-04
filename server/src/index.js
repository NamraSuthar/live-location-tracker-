import "dotenv/config"
import http from "http"
import express from "express";
import cors from "cors"
import session from "express-session"
import { Server } from "socket.io"

import healthRouter from "./routes/health.routes.js";
import authRouter from "./routes/auth.routes.js";
import { notFoundHandler } from "./middleware/notFound.middleware.js";
import { errorHandler } from "./middleware/error.middleware.js";
import { socketAuthMiddleware } from "./sockets/auth.socket.js";
import { connectProducer } from "./kafka/producer.js";
import { connectConsumer, runConsumer } from "./kafka/consumer.js";
import { timeStamp } from "console";
import { producer } from "./kafka/producer.js"
import { startDBConsumer } from "./kafka/dbConsumer.js";

const app = express();
const START_PORT = Number(process.env.PORT ?? 5000);

const server = http.createServer(app)

const io = new Server(server, {
    cors: {
        origin: ["http://localhost:8000", "https://trackkar-client.onrender.com"],
        methods: ["GET", "POST"]
    }
})


io.use(socketAuthMiddleware)

const userSocketMap = new Map();

io.on("connection", (socket) => {


    const userId = socket.user.sub;
    if (!userId) {
        console.log("Unauthorized socket");
        socket.disconnect();
        return;
    }


    userSocketMap.set(userId, socket.id);
    console.log("connection", socket.id)

    socket.on("disconnect", () => {
        userSocketMap.delete(userId)
        console.log("disconnect:", socket.id)
    })



    socket.on("send-location", async (data) => {
        try {
            const userId = socket.user.sub

            const locationEvent = {
                userId,
                latitude: data.latitude,
                longitude: data.longitude,
                timeStamp: Date.now(),
            }

            // Broadcast to all clients immediately
            io.emit('receive-location', locationEvent);

            // Try Kafka if available
            try {
                await producer.send({
                    topic: "location-update",
                    messages: [{
                        key: userId,
                        value: JSON.stringify(locationEvent)
                    }]
                })
            } catch (kafkaErr) {
                // Kafka failed but broadcast already sent
            }
        } catch (error) {
            console.error("error sending location", error.message)
        }
    })
        }
    )





app.use(cors())
app.use(express.json())

// Session middleware
app.use(
  session({
    secret: process.env.SESSION_SECRET || "dev-secret-change-this",
    resave: false,
    saveUninitialized: true,
    cookie: { 
      secure: false, // Set to true in production with HTTPS
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    },
  })
)

app.get("/auth/config", (req, res) => {
    res.json({
        dwaarUrl: process.env.DWAAR_ISSUER_URL,
        clientId: process.env.DWAAR_CLIENT_ID,
        redirectUri: process.env.DWAAR_REDIRECT_URI,
        authorizationEndpoint: process.env.DWAAR_AUTHORIZATION_ENDPOINT,
        tokenEndpoint: process.env.DWAAR_TOKEN_ENDPOINT,
    })
})

app.get("/", (req, res) => {
    res.json({
        Message: "chalo......"
    })
})

app.use("/health", healthRouter)
app.use("/auth", authRouter)

app.use(notFoundHandler)
app.use(errorHandler)

const startServer = async () => {
    const listenOnPort = (port) =>
        new Promise((resolve, reject) => {
            const onError = (err) => {
                server.off("listening", onListening)
                reject(err)
            }

            const onListening = () => {
                server.off("error", onError)
                resolve(port)
            }

            server.once("error", onError)
            server.once("listening", onListening)
            server.listen(port)
        })

    let activePort = START_PORT

    for (let attempts = 0; attempts <= 10; attempts += 1) {
        try {
            activePort = await listenOnPort(activePort)
            console.log(`server running on http://localhost:${activePort}`)
            break
        } catch (err) {
            if (err.code === "EADDRINUSE" && attempts < 10) {
                console.error(`Port ${activePort} is already in use, trying ${activePort + 1}`)
                activePort += 1
                continue
            }

            console.error("Server error", err)
            throw err
        }
    }

    // Initialize Kafka in background - don't crash if it fails
    if (process.env.KAFKA_BROKER) {
        await connectProducer().catch((err) => console.warn("Producer init warning:", err.message))
        await connectConsumer().catch((err) => console.warn("Consumer init warning:", err.message))
        await runConsumer(io).catch((err) => console.warn("Consumer run warning:", err.message))
        await startDBConsumer().catch((err) => console.warn("DB Consumer warning:", err.message))
    } else {
        console.log(" Kafka not configured - using direct Socket.IO broadcast")
    }
}

startServer();
