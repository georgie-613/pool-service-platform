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
 site.

### 1. Provision an Azure Web App

1. Sign in to the [Azure portal](https://portal.azure.com/) and create a new
   **Web App**. Give it a unique name (for example `pool-service-platform-app`),
   choose a runtime stack of **Node.js**, and select a region close to you. A
   resource group and App Service plan will be created automatically. After
   creation you can find your app’s default URL under **Overview**.

2. Generate a *publish profile* by navigating to your Web App in the portal,
   clicking **Get publish profile** and downloading the resulting XML file.
   This file contains deployment credentials. Store its contents as a
   [repository secret](https://docs.github.com/en/actions/security-guides/encrypted-secrets)
   named `AZURE_WEBAPP_PUBLISH_PROFILE` in your GitHub repository.

### 2. Set up GitHub Actions for CI/CD

A workflow file has been added at `.github/workflows/azure-webapp.yml` which
builds and deploys the application on every push to the `main` branch. It
checks out the code, installs Node dependencies, zips the project and uses
the `azure/webapps-deploy` action to publish it. The workflow relies on
certain variables:

- **AZURE_WEBAPP_NAME** – the name of your Web App. Update this in the YAML
  file if you used a different name when creating the app.
- **AZURE_WEBAPP_PUBLISH_PROFILE** – the secret described above. GitHub
  injects it into the action via `${{ secrets.AZURE_WEBAPP_PUBLISH_PROFILE }}`.
- **AZURE_WEBAPP_PACKAGE_PATH** – path to package. The default value `.`
  packages the whole repository which includes both backend and frontend.

When you push changes to `main` the workflow will run automatically. It uses
the official Azure deploy action shown in the GitHub docs to push the
package to your app【474220600761611†L524-L577】.

### 3. Configure environment variables

Important secrets such as `JWT_SECRET` should never be committed to the
repository. Azure provides **Configuration > Application settings** where you
can add key–value pairs that become environment variables at runtime. For
example, create an entry called `JWT_SECRET` and set it to your desired
secret value. You can also define `PORT` if you want to override the default
port (Azure automatically sets `PORT` or `SERVER_PORT` when running in
App Service【241746418339072†L144-L147】).

### 4. Point your domain and enforce HTTPS

After deployment you can configure a custom domain under **Custom domains** in
the portal and add a free SSL certificate under **TLS/SSL settings**. Follow
the wizard to verify your domain ownership and enable HTTPS.

After completing these steps, visit your Web App URL (for example
`https://pool-service-platform-app.azurewebsites.net`) and try registering
a user and adding a service. The CI/CD pipeline will automatically deploy
future commits. If issues arise, inspect the workflow logs in the **Actions**
tab and the application logs in **Log stream** of the Azure portal.
