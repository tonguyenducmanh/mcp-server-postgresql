#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError, } from '@modelcontextprotocol/sdk/types.js';
import { Pool } from 'pg';
const DB_CONFIG = {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    database: process.env.POSTGRES_DB || 'postgres',
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || '',
};
// Hàm parse connection string thành config object
function parseConnectionString(connectionString) {
    const config = {};
    const pairs = connectionString.split(';');
    for (const pair of pairs) {
        const [key, value] = pair.split('=');
        if (key && value) {
            if (key.toLowerCase() === 'port') {
                config[key.toLowerCase()] = parseInt(value);
            }
            else {
                switch (key.toLowerCase()) {
                    case 'username':
                        config['user'] = value;
                        break;
                    case 'host':
                        config['host'] = value;
                        break;
                    case 'password':
                        config['password'] = value;
                        break;
                    case 'database':
                        config['database'] = value;
                        break;
                    case 'pooling':
                        // Ignore pooling parameter as we always use pooling
                        break;
                    default:
                        config[key.toLowerCase()] = value;
                }
            }
        }
    }
    return config;
}
class PostgresServer {
    server;
    defaultPool;
    constructor() {
        this.server = new Server({
            name: 'postgresql-server',
            version: '1.0.0',
        }, {
            capabilities: {
                tools: {},
            },
        });
        this.defaultPool = new Pool(DB_CONFIG);
        this.setupToolHandlers();
        this.server.onerror = (error) => console.error('[MCP Error]', error);
        process.on('SIGINT', async () => {
            await this.defaultPool.end();
            await this.server.close();
            process.exit(0);
        });
    }
    async executeQueryWithConfig(query, params, connectionString) {
        let pool = this.defaultPool;
        if (connectionString) {
            const config = parseConnectionString(connectionString);
            // Tạo pool mới với config từ connection string
            pool = new Pool(config);
            try {
                const result = await pool.query(query, params);
                return result;
            }
            finally {
                // Đóng pool sau khi query xong
                await pool.end();
            }
        }
        else {
            return await pool.query(query, params);
        }
    }
    setupToolHandlers() {
        this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
            tools: [
                {
                    name: 'execute_query',
                    description: 'Thực thi câu query SQL',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            query: {
                                type: 'string',
                                description: 'Câu lệnh SQL cần thực thi',
                            },
                            params: {
                                type: 'array',
                                description: 'Các tham số cho câu query (optional)',
                                items: {
                                    type: 'string'
                                }
                            },
                            connectionString: {
                                type: 'string',
                                description: 'Connection string tùy chỉnh (optional)',
                            }
                        },
                        required: ['query']
                    }
                },
                {
                    name: 'list_tables',
                    description: 'Lấy danh sách các bảng trong database',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            schema: {
                                type: 'string',
                                description: 'Tên schema (mặc định là public)',
                                default: 'public'
                            },
                            connectionString: {
                                type: 'string',
                                description: 'Connection string tùy chỉnh (optional)',
                            }
                        }
                    }
                }
            ],
        }));
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            try {
                switch (request.params.name) {
                    case 'execute_query': {
                        const { query, params, connectionString } = request.params.arguments;
                        const result = await this.executeQueryWithConfig(query, params, connectionString);
                        return {
                            content: [
                                {
                                    type: 'text',
                                    text: JSON.stringify(result.rows, null, 2)
                                }
                            ]
                        };
                    }
                    case 'list_tables': {
                        const { schema = 'public', connectionString } = request.params.arguments;
                        const query = `
              SELECT table_name 
              FROM information_schema.tables
              WHERE table_schema = $1
              ORDER BY table_name
            `;
                        const result = await this.executeQueryWithConfig(query, [schema], connectionString);
                        return {
                            content: [
                                {
                                    type: 'text',
                                    text: JSON.stringify(result.rows, null, 2)
                                }
                            ]
                        };
                    }
                    default:
                        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
                }
            }
            catch (error) {
                console.error(error);
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Database error: ${error.message}`
                        }
                    ],
                    isError: true
                };
            }
        });
    }
    async run() {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error('PostgreSQL MCP server running on stdio');
    }
}
const server = new PostgresServer();
server.run().catch(console.error);
