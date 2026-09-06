# DevTrack

DevTrack is a full-stack web application that helps developers organize learning goals, track projects, and monitor their progress.

## 🚀 Local Development Setup

### ⚙️ Backend API Configuration

| Resource | URL |
| :--- | :--- |
| **Backend API** | http://localhost:3000 |
| **Health check** | http://localhost:3000/health |
| **Swagger UI** | http://localhost:3000/api-docs/ |
| **OpenAPI specification** | http://localhost:3000/openapi.json |

* **Open the API in a browser:** Navigate to `http://localhost:3000`
* **Verify the backend health status:** Check `http://localhost:3000/health`

### 💻 Frontend Website Setup
Start the frontend in a separate terminal and open the application:

| Resource | URL / Value |
| :--- | :--- |
| **Frontend website** | http://localhost:5173 |
| **Frontend API proxy** | `/api/*` |
| **Development API target** | `http://localhost:3000` |

### 🗄️ Database Management & Inspection
**PostgreSQL Connection Settings:**
* **Database engine:** PostgreSQL 18
* **Host:** `localhost`
* **Port:** `5432`
* **Database:** `devtrack`
* **User:** `postgres`
* **PostgreSQL CLI Path:** `C:\Program Files\PostgreSQL\18\bin\psql.exe`

**Common Database Inspection Commands:**
* **List all database tables:** `\dt`
* **Query user records:** `SELECT * FROM users;`
* **Query project records:** `SELECT * FROM projects;`
* **Exit the PostgreSQL interactive shell:** `\q`

## 🐳 Docker Deployment

For a quick containerized setup, run the following commands from the project root folder:

### ⚙️ Docker Compose Commands

| Action | Command |
| :--- | :--- |
| **Start Services** | `docker compose --env-file .env.docker up --build -d` |
| **Check Status** | `docker compose --env-file .env.docker ps` |

* **Open the application:** Navigate to `http://localhost:8081` once the containers are running healthy.

### Swagger API Documentation

Swagger UI is available at:

[http://localhost:3000/api-docs/](http://localhost:3000/api-docs/)

OpenAPI specification:

[http://localhost:3000/openapi.json](http://localhost:3000/openapi.json)
