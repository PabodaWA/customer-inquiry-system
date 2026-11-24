# Customer Inquiry System — Frontend

This directory contains the Next.js and React client for the role-based Customer Inquiry System.

For complete setup, database prerequisites, demo account details, API overview, and backend instructions, see the [project README](../README.md).

## Run locally

Install the frontend dependencies and start the development server:

```bash
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The frontend expects the API at `http://localhost:5000` by default. To use a different API URL, create `.env.local` in this directory:

```dotenv
NEXT_PUBLIC_API_URL=http://localhost:5000
```

## Checks

```bash
npm test
npm run lint
npm run build
```
