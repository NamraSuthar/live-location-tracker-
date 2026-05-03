import "dotenv/config"

import express from "express";
import cors from "cors"

import healthRouter from "./routes/health.routes.js";
import { notFoundHandler } from "./middleware/notFound.middleware.js";
import { errorHandler } from "./middleware/error.middleware.js";


const app = express();
const PORT = process.env.PORT ?? 5000;

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


app.listen(PORT, () => {
    console.log(`server running on http://localhost:${PORT}`)
})