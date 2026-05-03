import "dotenv/config"
import http from "http"
import express from "express";
import cors from "cors"
import { Server } from "socket.io"

import healthRouter from "./routes/health.routes.js";
import { notFoundHandler } from "./middleware/notFound.middleware.js";
import { errorHandler } from "./middleware/error.middleware.js";
import { socketAuthMiddleware } from "./sockets/auth.socket.js";
import { connectProducer } from "./kafka/producer.js";
import { connectConsumer, runConsumer } from "./kafka/consumer.js";
import { timeStamp } from "console";
import { producer } from "./kafka/producer.js"

const app = express();
const START_PORT = Number(process.env.PORT ?? 5000);

const server = http.createServer(app)

const io = new Server(server, {
    cors: {
        origin: "*",
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

            const locationEvant = {
                userId,
                latitude: data.latitude,
                longitude: data.longitude,
                timeStamp: Date.now(),
            }

            await producer.send({
                topic: "location-update",
                message: [{
                    key: userId,
                    value: JSON.stringify(locationEvant)
                }]
            })
        } catch (error) {
            console.error("error sending location", error.Message)
        }
    })

}
)




app.use(cors())
app.use(express.json())

app.get("/", (req, res) => {
    res.json({
        Message: "chalo......"
    })
})

app.use("/health", healthRouter)

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

    // initialize Kafka connections in background so startup isn't blocked
    connectProducer().catch((err) => console.error("Producer init error", err))
    connectConsumer().catch((err) => console.error("Consumer init error", err))
    await runConsumer(io)
}

startServer();
