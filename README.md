# Live Location Tracker

A real-time location tracking application built to share live user locations with multiple clients instantly. The project combines frontend geolocation, real-time communication with Socket.IO, event streaming with Kafka, authentication, and backend services to create a scalable tracking experience.

Live demo: https://trackkar-client.onrender.com

## About the Project

This project is a full-stack real-time application that allows users to share and view live location updates. It demonstrates how to build a modern web application with:

- Real-time communication using Socket.IO
- Event-driven architecture with Kafka
- Secure user authentication with JWT
- A responsive client-side interface for live tracking
- Backend services that can scale for multiple users and real-time data flow

It is useful for showcasing practical skills in full-stack development, real-time systems, APIs, messaging systems, and deployment.

## AI-Friendly Project Summary

Live Location Tracker is a real-time location sharing application built with Node.js, Express, Socket.IO, Kafka, and a frontend client. It enables users to send their live coordinates, broadcast updates to connected users, and handle real-time communication efficiently. The project highlights skills in backend architecture, event-driven systems, authentication, deployment, and building interactive user experiences.


## Project Structure

```
Live Location Tracker/
├── client/              # Frontend (HTML, CSS, JS)
│   ├── app.js          # Main client app
│   ├── index.html      # HTML page
│   ├── style.css       # Styles
│   └── package.json
├── server/             # Backend (Express + Socket.IO)
│   ├── src/
│   │   ├── index.js    # Main server
│   │   ├── sockets/    # Socket events
│   │   ├── kafka/      # Kafka integration
│   │   ├── routes/     # Express routes
│   │   └── middleware/ # Express middleware
│   ├── package.json
│   └── .env            # Environment config
└── package.json        # Root config
```

## Quick Start

### 1. Install Dependencies
```bash
npm run setup
```
This installs dependencies for both server and client.

### 2. Server Setup
- Make sure `server/.env` has proper config (Kafka broker, JWT settings)
- Server runs on: **http://localhost:5000**

### 3. Run Development Mode

**Option A: Run both together**
```bash
npm run dev
```

**Option B: Run separately**
```bash
# Terminal 1 - Server
npm run dev:server

# Terminal 2 - Client
npm run dev:client
```

### 4. Access the App
Open browser and go to: **http://localhost:8000**

## How It Works

1. **Client** (Port 8000)
   - Connects to server at `http://localhost:5000`
   - Sends location updates via Socket.IO
   - Displays live locations on map

2. **Server** (Port 5000)
   - Receives location updates from clients
   - Broadcasts to all connected clients via Kafka + Socket.IO
   - Persists data via DB Consumer

## Features

✅ Real-time location tracking  
✅ Multi-user support  
✅ JWT authentication  
✅ Kafka event streaming  
✅ Database persistence  
✅ Map visualization (Leaflet)  

## Kafka Setup

**Local Development (Docker):**
```bash
docker run -d \
  --name kafka \
  -p 9092:9092 \
  -e KAFKA_BROKER_ID=1 \
  -e KAFKA_ZOOKEEPER_CONNECT=localhost:2181 \
  -e KAFKA_ADVERTISED_LISTENERS=PLAINTEXT://localhost:9092 \
  confluentinc/cp-kafka:latest
```

**Cloud Deployment:**
- Use Confluent Cloud, AWS MSK, or Upstash
- Update `KAFKA_BROKER` in `.env`

**Verify Kafka:**
```bash
# Check if broker is responding
curl -s http://localhost:9092
```

## How Kafka Works Here

1. **Client** sends location → Socket.IO → Server
2. **Server** publishes to `location-update` topic via Kafka
3. **Consumer** reads from Kafka topic
4. **Consumer** broadcasts to all connected clients via Socket.IO
5. **DB Consumer** processes events for persistence

This decouples socket layer from persistence - key for scalability!


## Troubleshooting

- **Can't connect to server?** Check if port 5000 is available
- **No locations showing?** Verify browser geolocation permission
- **Kafka errors?** Ensure Kafka broker is running


### 5. Kafka Setup for Production

Use Confluent Cloud or Upstash:
- Create cluster
- Get broker URL
- Update `KAFKA_BROKER` env var on Render

**Done!** Your app is live 🚀
