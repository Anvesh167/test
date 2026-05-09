# Admin-Controlled IQ Test Platform

End-to-end React + Express + WebSocket application for a 10-question professional IQ test.

The test taker only enters a username and answers the questions. Their result is not calculated from correct answers. The admin reviews the submission and manually publishes whatever result they decide.

## Run locally

```bash
npm install
npm run dev
```

Open the React app at `http://127.0.0.1:5173`.

The API and WebSocket server run at `http://localhost:5000`.

## Admin login

Default credentials:

```text
Admin ID: admin
Password: admin123
```

Override them with environment variables:

```bash
ADMIN_ID=myadmin ADMIN_PASSWORD=strong-password npm run server
```

## Data

Submissions and admin-published results are stored in a local NeDB database at:

```text
data/iq-platform-submissions.db
```
