export type RefResolver = (value: unknown) => any;

function decodePointerToken(token: string): string {
  return token.replace(/~1/g, '/').replace(/~0/g, '~');
}

function lookupPointer(spec: any, pointer: string): { found: boolean; value: any } {
  if (!pointer.startsWith('#/')) return { found: false, value: undefined };
  const tokens = pointer.slice(2).split('/').map(decodePointerToken);
  let node: any = spec;
  for (const token of tokens) {
    if (node === null || node === undefined) return { found: false, value: undefined };
    if (Array.isArray(node)) {
      const index = Number(token);
      if (!Number.isInteger(index) || index < 0 || index >= node.length) return { found: false, value: undefined };
      node = node[index];
      continue;
    }
    if (typeof node !== 'object') return { found: false, value: undefined };
    if (!Object.prototype.hasOwnProperty.call(node, token)) return { found: false, value: undefined };
    node = node[token];
  }
  return { found: true, value: node };
}

export function createRefResolver(spec: any): RefResolver {
  const cache = new Map<string, any>();
  const active = new Set<string>();
  let cycleBreaks = 0;

  const resolve = (value: any): any => {
    if (Array.isArray(value)) return value.map(resolve);
    if (!value || typeof value !== 'object') return value;

    const pointer = (value as Record<string, any>).$ref;
    if (typeof pointer === 'string') {
      const target = resolvePointer(pointer, value);
      const siblings = Object.entries(value as Record<string, any>).filter(([key]) => key !== '$ref');
      if (target === value || siblings.length === 0) return target;
      if (!target || typeof target !== 'object' || Array.isArray(target)) return target;
      const merged: Record<string, any> = { ...target };
      for (const [key, sibling] of siblings) merged[key] = resolve(sibling);
      return merged;
    }

    const out: Record<string, any> = {};
    for (const [key, child] of Object.entries(value as Record<string, any>)) out[key] = resolve(child);
    return out;
  };

  const resolvePointer = (pointer: string, original: any): any => {
    if (!pointer.startsWith('#/')) return original;
    if (cache.has(pointer)) return cache.get(pointer);
    if (active.has(pointer)) {
      cycleBreaks += 1;
      return { error: `Circular reference detected: ${pointer}` };
    }
    const { found, value: target } = lookupPointer(spec, pointer);
    if (!found) return original;
    active.add(pointer);
    const breaksBefore = cycleBreaks;
    const resolved = resolve(target);
    active.delete(pointer);
    if (cycleBreaks === breaksBefore) cache.set(pointer, resolved);
    return resolved;
  };

  return (value: unknown) => resolve(value);
}

function toExtensionAwareScheme(scheme: any): any {
  if (!scheme || typeof scheme !== 'object' || Array.isArray(scheme)) return scheme;
  const result: Record<string, any> = {};
  const extensions: Record<string, any> = {};
  for (const [key, value] of Object.entries(scheme as Record<string, any>)) {
    if (key.startsWith('x-')) {
      extensions[key] = value;
      continue;
    }
    if ((key === 'type' || key === 'in') && typeof value === 'string') {
      result[key] = value.toUpperCase();
      continue;
    }
    result[key] = value;
  }
  if (Object.keys(extensions).length > 0) result.extensions = extensions;
  return result;
}

export function resolveSecurityRequirements(security: any, spec: any, resolveRefs: RefResolver): any {
  if (!Array.isArray(security) || security.length === 0) return security;
  const schemes = spec?.components?.securitySchemes;
  if (!schemes || typeof schemes !== 'object') return security;

  const resolved: Record<string, any> = {};
  let matched = false;
  for (const requirement of security) {
    if (!requirement || typeof requirement !== 'object' || Array.isArray(requirement)) continue;
    for (const name of Object.keys(requirement as Record<string, any>)) {
      const scheme = (schemes as Record<string, any>)[name];
      if (scheme === undefined) continue;
      resolved[name] = toExtensionAwareScheme(resolveRefs(scheme));
      matched = true;
    }
  }
  return matched ? resolved : security;
}

const SCHEMA_CHILD_KEYS = [
  'items',
  'not',
  'additionalProperties',
  'contains',
  'if',
  'then',
  'else',
  'propertyNames',
  'unevaluatedItems',
  'unevaluatedProperties',
];
const SCHEMA_MAP_KEYS = ['properties', 'patternProperties', 'dependentSchemas', '$defs', 'definitions'];
const SCHEMA_LIST_KEYS = ['allOf', 'anyOf', 'oneOf', 'prefixItems'];

function isPlainObject(value: any): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function mapValues(node: any, project: (value: any) => any): any {
  if (!isPlainObject(node)) return node;
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(node)) out[key] = project(value);
  return out;
}

function projectSchema(node: any): any {
  if (Array.isArray(node)) return node.map(projectSchema);
  if (!isPlainObject(node)) return node;
  const out: Record<string, any> = { ...node };
  if (Object.prototype.hasOwnProperty.call(node, 'nullable')) {
    const extensions = isPlainObject(node.extensions) ? { ...node.extensions } : {};
    extensions.nullable = node.nullable;
    out.extensions = extensions;
  }
  for (const key of SCHEMA_CHILD_KEYS) {
    if (key in out) out[key] = projectSchema(out[key]);
  }
  for (const key of SCHEMA_MAP_KEYS) {
    if (key in out) out[key] = mapValues(out[key], projectSchema);
  }
  for (const key of SCHEMA_LIST_KEYS) {
    if (Array.isArray(out[key])) out[key] = out[key].map(projectSchema);
  }
  return out;
}

function projectExample(node: any): any {
  if (!isPlainObject(node)) return node;
  return { ...node, valueSetFlag: Object.prototype.hasOwnProperty.call(node, 'value') };
}

function projectMediaType(node: any): any {
  if (!isPlainObject(node)) return node;
  const out: Record<string, any> = { ...node };
  if ('schema' in out) out.schema = projectSchema(out.schema);
  if (isPlainObject(out.examples)) out.examples = mapValues(out.examples, projectExample);
  return out;
}

function projectHeader(node: any): any {
  if (!isPlainObject(node)) return node;
  const out: Record<string, any> = { ...node };
  out.style = typeof node.style === 'string' ? node.style.toUpperCase() : 'SIMPLE';
  out.explode = typeof node.explode === 'boolean' ? node.explode : false;
  if ('schema' in out) out.schema = projectSchema(out.schema);
  if (isPlainObject(out.content)) out.content = mapValues(out.content, projectMediaType);
  return out;
}

function projectResponse(node: any): any {
  if (!isPlainObject(node)) return node;
  const out: Record<string, any> = { ...node };
  if (isPlainObject(out.headers)) out.headers = mapValues(out.headers, projectHeader);
  if (isPlainObject(out.content)) out.content = mapValues(out.content, projectMediaType);
  return out;
}

export function projectResponses(node: any): any {
  return isPlainObject(node) ? mapValues(node, projectResponse) : node;
}

export function projectRequestBody(node: any): any {
  if (!isPlainObject(node)) return node;
  const out: Record<string, any> = { ...node };
  if (isPlainObject(out.content)) out.content = mapValues(out.content, projectMediaType);
  return out;
}
