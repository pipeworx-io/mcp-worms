# mcp-worms

WoRMS (World Register of Marine Species) MCP — keyless.

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1394+ live data sources.

## Tools

| Tool | Description |
|------|-------------|
| `search_species` | Resolve a marine species or genus name to its WoRMS AphiaID, accepted name, authority, status (accepted/unaccepted), rank, and high-level classification (kingdom/family/genus). WoRMS is the authoritative world register of marine species. Keyless. |
| `get_classification` | Walk the full taxonomic lineage (root → tip) for a WoRMS AphiaID: returns a flat ordered array of { rank, name, aphia_id } from superdomain down to the taxon itself. Keyless. |
| `get_common_names` | Get common (vernacular) names for a WoRMS AphiaID across languages. Keyless. |

## Quick Start

Add to your MCP client (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "worms": {
      "url": "https://gateway.pipeworx.io/worms/mcp"
    }
  }
}
```

Or connect to the full Pipeworx gateway for access to all 1394+ data sources:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English:

```
ask_pipeworx({ question: "your question about Worms data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
