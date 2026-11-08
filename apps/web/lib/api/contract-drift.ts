import ts from "typescript"

export interface OpenApiContract {
  paths: Record<string, Record<string, { requestBody?: { content?: Record<string, { schema?: { $ref?: string } }> } }>>
  components: { schemas: Record<string, JsonSchema> }
}

interface JsonSchema {
  $ref?: string
  type?: string | string[]
  enum?: unknown[]
  const?: unknown
  anyOf?: JsonSchema[]
  oneOf?: JsonSchema[]
  allOf?: JsonSchema[]
  properties?: Record<string, JsonSchema>
}

export interface Drift {
  interface: string
  property: string
  direction: "request" | "response"
  problem: string
}

export interface DriftReport {
  drift: Drift[]
  unmapped: string[]
  checked: number
}

type Kind = "string" | "number" | "boolean" | "null" | "array" | "object"

export function requestSchemas(contract: OpenApiContract): Set<string> {
  const names = new Set<string>()
  for (const operations of Object.values(contract.paths)) {
    for (const operation of Object.values(operations)) {
      for (const media of Object.values(operation.requestBody?.content ?? {})) {
        const ref = media.schema?.$ref
        if (ref) names.add(ref.split("/").pop() as string)
      }
    }
  }
  return names
}

function contractKinds(schema: JsonSchema | undefined, schemas: Record<string, JsonSchema>, out = new Set<Kind>()) {
  if (!schema) return out
  if (schema.$ref) {
    const target = schemas[schema.$ref.split("/").pop() as string]
    if (target && !target.properties) contractKinds(target, schemas, out)
    else out.add("object")
    return out
  }
  for (const branch of [...(schema.anyOf ?? []), ...(schema.oneOf ?? []), ...(schema.allOf ?? [])])
    contractKinds(branch, schemas, out)
  const types = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : []
  for (const type of types) out.add((type === "integer" ? "number" : type) as Kind)
  if (!types.length && schema.enum)
    for (const value of schema.enum) out.add(value === null ? "null" : (typeof value as Kind))
  if (schema.const !== undefined) out.add(typeof schema.const as Kind)
  return out
}

function tsKinds(node: ts.TypeNode, aliases: Map<string, ts.TypeNode>, seen = new Set<string>()): Set<Kind> | null {
  const out = new Set<Kind>()
  const visit = (n: ts.TypeNode): boolean => {
    switch (n.kind) {
      case ts.SyntaxKind.StringKeyword:
        out.add("string")
        return true
      case ts.SyntaxKind.NumberKeyword:
        out.add("number")
        return true
      case ts.SyntaxKind.BooleanKeyword:
        out.add("boolean")
        return true
      case ts.SyntaxKind.NullKeyword:
        out.add("null")
        return true
      case ts.SyntaxKind.UndefinedKeyword:
        return true
      case ts.SyntaxKind.ArrayType:
      case ts.SyntaxKind.TupleType:
        out.add("array")
        return true
      case ts.SyntaxKind.TypeLiteral:
        out.add("object")
        return true
      case ts.SyntaxKind.ParenthesizedType:
        return visit((n as ts.ParenthesizedTypeNode).type)
      case ts.SyntaxKind.UnionType:
        return (n as ts.UnionTypeNode).types.every(visit)
      case ts.SyntaxKind.LiteralType: {
        const literal = (n as ts.LiteralTypeNode).literal
        if (literal.kind === ts.SyntaxKind.StringLiteral) out.add("string")
        else if (literal.kind === ts.SyntaxKind.NumericLiteral) out.add("number")
        else if (literal.kind === ts.SyntaxKind.NullKeyword) out.add("null")
        else out.add("boolean")
        return true
      }
      case ts.SyntaxKind.TypeReference: {
        const name = (n as ts.TypeReferenceNode).typeName.getText()
        if (name === "Array") out.add("array")
        else if (name === "Record" || name === "Partial") out.add("object")
        else if (aliases.has(name)) {
          if (seen.has(name)) return false
          const resolved = tsKinds(aliases.get(name) as ts.TypeNode, aliases, new Set(seen).add(name))
          if (!resolved) return false
          resolved.forEach((kind) => out.add(kind))
        } else out.add("object")
        return true
      }
      default:
        return false
    }
  }
  return visit(node) ? out : null
}

export function findDrift(
  source: string,
  contract: OpenApiContract,
  aliases: Record<string, string> = {}
): DriftReport {
  const file = ts.createSourceFile("xvm-api.ts", source, ts.ScriptTarget.Latest, true)
  const typeAliases = new Map<string, ts.TypeNode>()
  const interfaces: ts.InterfaceDeclaration[] = []
  file.forEachChild((node) => {
    if (ts.isTypeAliasDeclaration(node)) typeAliases.set(node.name.text, node.type)
    if (ts.isInterfaceDeclaration(node)) interfaces.push(node)
  })

  const schemas = contract.components.schemas
  const requests = requestSchemas(contract)
  const drift: Drift[] = []
  const unmapped: string[] = []
  let checked = 0

  for (const declaration of interfaces) {
    const name = declaration.name.text
    const schemaName = aliases[name] ?? name
    const schema = schemas[schemaName]
    if (!schema?.properties) {
      unmapped.push(name)
      continue
    }
    checked++
    const direction = requests.has(schemaName) ? "request" : "response"
    for (const member of declaration.members) {
      if (!ts.isPropertySignature(member) || !member.type) continue
      const property = member.name.getText().replace(/['"]/g, "")
      const entry = schema.properties[property]
      if (!entry) {
        drift.push({ interface: name, property, direction, problem: "not in the contract" })
        continue
      }
      const have = tsKinds(member.type, typeAliases)
      if (!have) continue
      const want = contractKinds(entry, schemas)
      if (direction === "response") {
        const missing = [...want].filter((kind) => !have.has(kind))
        if (missing.length)
          drift.push({
            interface: name,
            property,
            direction,
            problem: `contract can return ${missing.join("|")}, the type omits it`,
          })
      } else {
        const rejected = [...have].filter((kind) => !want.has(kind) && !(kind === "string" && want.has("number")))
        if (rejected.length)
          drift.push({
            interface: name,
            property,
            direction,
            problem: `type allows ${rejected.join("|")}, the contract rejects it`,
          })
      }
    }
  }
  return { drift, unmapped, checked }
}
