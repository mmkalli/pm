Start and stop scripts for Mac, Linux, and Windows. Each script runs from the repository root.

- `start.sh` and `stop.sh` for Mac and Linux
- `start.ps1` and `stop.ps1` for Windows

Start runs `docker compose up --build -d`. Stop runs `docker compose down`. The app listens on port 8000.
