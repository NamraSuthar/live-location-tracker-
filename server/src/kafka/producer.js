import { Partitioners } from "kafkajs";
import { kafka } from "./client.js";

export const producer = kafka.producer({
    createPartitioner: Partitioners.LegacyPartitioner,
})

export const connectProducer = async () => {
    try {
        await producer.connect()
        console.log(`producer kafka connected`)
    } catch (err) {
        console.warn("Kafka unavailable - using Socket.IO broadcast")
    }
}

export const isKafkaConnected = () => false;