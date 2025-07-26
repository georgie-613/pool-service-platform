# Pool Service Platform

This repository contains a full‑stack sample application for managing pool
maintenance services. It’s built entirely with vanilla Node.js on the
back‑end and a simple HTML/CSS/JavaScript front‑end. Users can register,
log in, add services with dates, edit or delete existing entries, and all
data is persisted to disk using JSON files.

## Project structure

The code has been organised into separate directories to make deployment
clearer:

```
pool-service-platform/
│
├── backend/           # Node.js server and persistence modules
│   ├── index.js       # main server entry point
│   ├── serviceStore.js# helpers for reading/writing services.json
│   ├── userStore.js   # helpers for reading/writing users.json
│   ├── services.json  # persisted list of services
│   └── users.json     # persisted list of registered users
│
├── frontend/          # client‑side HTML and JS
│   └── index.html     # single‑page application for the dashboard
│
├── index.js           # original server (kept for history)
├── serviceStore.js    # original store (kept for history)
├── userStore.js       # original store (kept for history)
├── public/            # legacy front‑end directory (superseded by frontend/)
├── package.json       # NPM metadata (no third‑party deps required)
└── .gitignore         # excludes secret and log files
```

## Prerequisites

* [Node.js](https://nodejs.org/) installed (v14 or later recommended)
* [Git](https://git-scm.com/) installed

## Running locally

1. Clone this repository:

   ```bash
   git clone https://github.com/your‑username/pool-service-platform.git
   cd pool-service-platform
   ```

2. Create a `.env` file in the project root to store secrets. For example:

   ```env
   JWT_SECRET=your_super_secret_key
   PORT=3000
   ```

   The `JWT_SECRET` is used to sign JSON Web Tokens for authentication. You
   can omit `PORT` to use the default of 3000.

3. Start the back‑end:

   ```bash
   node backend/index.js
   ```

   The server will read your `.env` file, start listening on the configured
   port, and log each request to `backend/server.log`.

4. Open the front‑end in your browser by navigating to
   `http://localhost:3000/`. You can register a new user, log in, and begin
   adding services. Once logged in your JWT token is stored in `sessionStorage`
   and included on subsequent API requests.

## Development notes

* **Authentication:** Passwords are hashed on the server using SHA‑256. On
  successful login, the server issues a JWT which must be included in the
  `Authorization` header (`Bearer <token>`) for all service API requests.
* **CORS:** Cross‑origin resource sharing headers are set on every response to
  allow the front‑end to be served from a different origin during
  development.
* **Persistence:** Data is stored in JSON files within the `backend`
  directory. In a production system you would likely replace this with a
  database.

## Preparing for deployment

Days 11–12 of the guide cover deploying this application to Azure. With
the code now separated into `frontend` and `backend` directories, you can
deploy the back‑end to an Azure App Service and the front‑end as a static
site. Environment variables such as `JWT_SECRET` should be configured
through the Azure portal or your CI/CD pipeline. See the guide for
detailed steps.
