# Live Location Tracker

A real-time location tracking application with live updates using Socket.IO and Kafka.

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

## Deployment on Render

### 1. Push to GitHub
```bash
git add .
git commit -m "feat: add complete TrackKar location tracking with Kafka"
git push origin main
```

### 2. Deploy Server on Render

**Create Web Service:**
- Go to [render.com](https://render.com)
- New → Web Service
- Connect GitHub repo
- **Runtime:** Node
- **Build Command:** `cd server && pnpm install`
- **Start Command:** `cd server && pnpm dev`

**Environment Variables:**
```
PORT=5000
KAFKA_BROKER=your-kafka-broker:9092
DWAAR_JWKS_URI=https://dwaar-okjc.onrender.com/.well-known/jwks.json
DWAAR_ISSUER_URL=https://dwaar-okjc.onrender.com
DWAAR_CLIENT_ID=your-client-id
```

### 3. Deploy Frontend on Render

**Create Static Site:**
- New → Static Site
- Connect GitHub repo
- **Publish Directory:** `client`
- **Build Command:** (leave empty - no build needed)

### 4. Update Client Connection

In `client/app.js`, change:
```javascript
getBackendUrl() {
    return 'https://your-render-server.onrender.com'; // Your Render server URL
}
```

### 5. Kafka Setup for Production

Use Confluent Cloud or Upstash:
- Create cluster
- Get broker URL
- Update `KAFKA_BROKER` env var on Render

**Done!** Your app is live 🚀
