import { kafka } from "./client.js";

const dbConsumer = kafka.consumer({
  groupId: "db-group",
});

export const startDBConsumer = async () => {
  await dbConsumer.connect();

  await dbConsumer.subscribe({
    topic: "location-updates",
    fromBeginning: false,
  });

  console.log("✅ DB Consumer connected");

  await dbConsumer.run({
    eachMessage: async ({ message }) => {
      const data = JSON.parse(message.value.toString());

      // simulate DB write
      console.log("💾 Storing location:", data);

      // future:
      // await saveToDatabase(data);
    },
  });
};