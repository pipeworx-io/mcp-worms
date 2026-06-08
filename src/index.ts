interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  meter?: { credits: number };
  cost?: Record<string, unknown>;
  provider?: string;
}

/**
 * WoRMS (World Register of Marine Species) MCP — keyless.
 *
 * Authoritative marine-species taxonomy. Resolve a marine species/genus name
 * to its AphiaID + accepted name + classification, walk the full taxonomic
 * lineage, and get common (vernacular) names. No API key required.
 */


const BASE = 'https://www.marinespecies.org/rest';
const UA = 'pipeworx/1.0 (+https://pipeworx.io)';

const tools: McpToolExport['tools'] = [
  {
    name: 'search_species',
    description:
      'Resolve a marine species or genus name to its WoRMS AphiaID, accepted name, authority, status (accepted/unaccepted), rank, and high-level classification (kingdom/family/genus). WoRMS is the authoritative world register of marine species. Keyless.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Scientific name to look up, e.g. "Orcinus orca" or "Octopus".' },
        fuzzy: { type: 'boolean', description: 'Fuzzy/like matching (LIKE substring). Default false (exact).' },
        marine_only: { type: 'boolean', description: 'Restrict to marine taxa. Default true.' },
      },
      required: ['name'],
    },
  },
  {
    name: 'get_classification',
    description:
      'Walk the full taxonomic lineage (root → tip) for a WoRMS AphiaID: returns a flat ordered array of { rank, name, aphia_id } from superdomain down to the taxon itself. Keyless.',
    inputSchema: {
      type: 'object',
      properties: {
        aphia_id: { type: ['number', 'string'], description: 'WoRMS AphiaID, e.g. 137102.' },
      },
      required: ['aphia_id'],
    },
  },
  {
    name: 'get_common_names',
    description:
      'Get common (vernacular) names for a WoRMS AphiaID across languages. Keyless.',
    inputSchema: {
      type: 'object',
      properties: {
        aphia_id: { type: ['number', 'string'], description: 'WoRMS AphiaID, e.g. 137102.' },
      },
      required: ['aphia_id'],
    },
  },
];

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  try {
    switch (name) {
      case 'search_species':
        return await searchSpecies(args);
      case 'get_classification':
        return await getClassification(args);
      case 'get_common_names':
        return await getCommonNames(args);
      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

interface AphiaRecord {
  AphiaID?: number;
  scientificname?: string;
  authority?: string;
  status?: string;
  rank?: string;
  kingdom?: string;
  family?: string;
  genus?: string;
  valid_name?: string;
  valid_AphiaID?: number;
}

interface ClassificationNode {
  AphiaID?: number;
  rank?: string;
  scientificname?: string;
  child?: ClassificationNode | null;
}

interface Vernacular {
  vernacular?: string;
  language_code?: string;
  language?: string;
}

async function searchSpecies(args: Record<string, unknown>): Promise<unknown> {
  const name = reqStr(args, 'name');
  const fuzzy = args.fuzzy === true;
  const marineOnly = args.marine_only === undefined ? true : args.marine_only === true;
  const url = `${BASE}/AphiaRecordsByName/${encodeURIComponent(name)}?like=${fuzzy}&marine_only=${marineOnly}`;
  const data = await wormsGet(url);
  if (data === null || !Array.isArray(data)) return { count: 0, species: [] };
  const records = data as AphiaRecord[];
  const species = records.map((r) => ({
    aphia_id: r.AphiaID,
    name: r.scientificname,
    authority: r.authority,
    status: r.status,
    rank: r.rank,
    kingdom: r.kingdom,
    family: r.family,
    genus: r.genus,
    valid_name: r.valid_name,
    accepted_aphia_id: r.valid_AphiaID,
  }));
  return { count: species.length, species };
}

async function getClassification(args: Record<string, unknown>): Promise<unknown> {
  const id = reqId(args, 'aphia_id');
  const data = await wormsGet(`${BASE}/AphiaClassificationByAphiaID/${encodeURIComponent(id)}`);
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return { error: 'not found', aphia_id: id };
  }
  const lineage: Array<{ rank: string | undefined; name: string | undefined; aphia_id: number | undefined }> = [];
  let node: ClassificationNode | null | undefined = data as ClassificationNode;
  while (node && typeof node === 'object') {
    lineage.push({ rank: node.rank, name: node.scientificname, aphia_id: node.AphiaID });
    node = node.child;
  }
  if (lineage.length === 0) return { error: 'not found', aphia_id: id };
  return { aphia_id: id, lineage };
}

async function getCommonNames(args: Record<string, unknown>): Promise<unknown> {
  const id = reqId(args, 'aphia_id');
  const data = await wormsGet(`${BASE}/AphiaVernacularsByAphiaID/${encodeURIComponent(id)}`);
  if (data === null || !Array.isArray(data)) return { aphia_id: id, count: 0, names: [] };
  const records = data as Vernacular[];
  const names = records.map((r) => ({ name: r.vernacular, language: r.language }));
  return { aphia_id: id, count: names.length, names };
}

/**
 * GET a WoRMS endpoint. Returns parsed JSON, or null when WoRMS signals
 * "no match" via HTTP 204 / empty body (calling res.json() on an empty body
 * would throw). Non-OK, non-204 responses throw.
 */
async function wormsGet(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': UA } });
  if (res.status === 204) return null;
  if (!res.ok) throw new Error(`WoRMS: ${res.status} ${(await res.text()).slice(0, 200)}`);
  const text = await res.text();
  if (!text.trim()) return null;
  return JSON.parse(text);
}

function reqStr(args: Record<string, unknown>, key: string): string {
  const v = args[key];
  if (typeof v !== 'string' || !v.trim()) throw new Error(`Required argument "${key}" is missing.`);
  return v;
}

function reqId(args: Record<string, unknown>, key: string): string {
  const v = args[key];
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  if (typeof v === 'string' && v.trim()) return v.trim();
  throw new Error(`Required argument "${key}" is missing. Pass a number or string AphiaID.`);
}

export default { tools, callTool, meter: { credits: 1 } } satisfies McpToolExport;
