# puppeteer screenshot api

### Installation

1. Clone the repository
2. ```bash docker compose up -d --build```

### Usage
```bash
curl -X POST "http://localhost:3020/screenshot" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://bartoszbak.org", "zoom": 2.2}' \
  -o screenshot.jpeg
```

```zoom``` body parameter is optional, defaults to 1.0

The default port is ```3020```, can be changed in ```docker-compose.yml```