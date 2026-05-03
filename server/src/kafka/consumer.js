import { kafka } from "./client.js";

export const consumer = kafka.consumer({
    groupId: "location-group",
})

export const connectConsumer = async () => {
    try {
        await consumer.connect()

        await consumer.subscribe({
            topic: "location-update",
            fromBeginning: false,
        })
        console.log("kafka consumer connected")
    } catch (err) {
        console.error("Failed to connect consumer:", err.message)
    }
}

export const runConsumer = async(io) =>{
    await consumer.run({
        eachMessage: async ({message})=>{
            const data = JSON.parse(message.value.toString())

            console.log("Location received", data)
            io.emit("receive-location",data)
        }
    })
}