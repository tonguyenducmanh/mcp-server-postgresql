simple mcp server to to connect postgresql

config in cline_mcp_settings.json

```
{
  "mcpServers": {
    "postgres": {
      "command": "node",
      "args": [
        "C:/Users/tdmanh1/Documents/Cline/MCP/postgres-server/build/index.js"
      ],
      "env": {
        "POSTGRES_HOST": "192.168.41.129",
        "POSTGRES_PORT": "5432",
        "POSTGRES_DB": "db_w4m3nb_2014",
        "POSTGRES_USER": "admin",
        "POSTGRES_PASSWORD": "12345678@Abc"
      },
      "disabled": false,
      "autoApprove": []
    }
  }
}

```
