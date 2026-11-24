/** Release-only namespace mapping; workspace source identity stays unchanged. */
import ts from "typescript";

export interface PublicIdentity {
  name: string;
  version: string;
}
export type PublicNames = ReadonlyMap<string, PublicIdentity>;

export function publicDependencies(dependencies: Record<string, string>, names: PublicNames): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [name, version] of Object.entries(dependencies)) {
    const publicPackage = names.get(name);
    if (name.startsWith("@sanctum/") && !publicPackage) throw new Error(`${name} is not a public SDK`);
    const target = publicPackage?.name ?? name;
    if (target in result) throw new Error(`duplicate published dependency ${target}`);
    result[target] = publicPackage?.version ?? version;
  }
  return result;
}

function publicSpecifier(specifier: string, names: PublicNames): string {
  const name = specifier.startsWith("@") ? specifier.split("/").slice(0, 2).join("/") : specifier.split("/")[0]!;
  const publicPackage = names.get(name);
  if (name.startsWith("@sanctum/") && !publicPackage) throw new Error(`${name} is not a public SDK`);
  if (publicPackage) return `${publicPackage.name}${specifier.slice(name.length)}`;
  return specifier.startsWith(".") ? specifier.replace(/\.ts$/u, ".js") : specifier;
}

/**
 * Parse actual imports/exports, including import types and lazy imports. Prose stays untouched.
 * The approved namespace and .ts→.js changes have identical width, preserving the compiler's
 * generated source-map columns. Reject future unequal-width mappings until maps can be re-emitted.
 * Embedded source content remains the original compiler input, not rewritten generated code.
 */
export function rewriteModuleSpecifiers(source: string, names: PublicNames): string {
  const file = ts.createSourceFile("module.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const edits: { start: number; end: number; value: string }[] = [];
  const add = (node: ts.Expression | undefined): void => {
    if (!node || !ts.isStringLiteral(node)) return;
    const value = publicSpecifier(node.text, names);
    if (value === node.text) return;
    const start = node.getStart(file) + 1;
    const end = node.getEnd() - 1;
    if (value.length !== end - start) throw new Error(`rewriting ${node.text} would invalidate source-map columns`);
    edits.push({ start, end, value });
  };
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) add(node.moduleSpecifier);
    else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) add(node.argument.literal);
    else if (ts.isExternalModuleReference(node)) add(node.expression);
    else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require"))
    )
      add(node.arguments[0]);
    ts.forEachChild(node, visit);
  };
  visit(file);
  let result = source;
  for (const edit of edits.sort((left, right) => right.start - left.start)) {
    result = `${result.slice(0, edit.start)}${edit.value}${result.slice(edit.end)}`;
  }
  return result;
}
