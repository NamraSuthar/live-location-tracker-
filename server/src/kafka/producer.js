import { kafka } from "./client.js";

export const producer = kafka.producer()

export const connectProducer = async () => {
    try {
        await producer.connect()
        console.log(`producer kafka connected`)
    } catch (err) {
        console.error("Failed to connect producer:", err.message)
    }
}