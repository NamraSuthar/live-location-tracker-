import "dotenv/config"
import { Kafka } from "kafkajs"

export const kafka = new Kafka({
    clientId: "live-location-tracker",
    brokers: [process.env.KAFKA_BROKER].filter(Boolean),
})