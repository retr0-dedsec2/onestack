import ts from "typescript";

export type UniversalIRNode =
  | UniversalIRElement
  | UniversalIRComponent
  | UniversalIRFragment
  | UniversalIRText
  | UniversalIRExpression;

interface UniversalIRBase {
  id: number;
  start: number;
  end: number;
  static: boolean;
}

export interface UniversalIRProp {
  name: string;
  value: string | null;
  static: boolean;
}

export interface UniversalIRElement extends UniversalIRBase {
  kind: "element";
  tag: string;
  props: UniversalIRProp[];
  children: UniversalIRNode[];
}

export interface UniversalIRComponent extends UniversalIRBase {
  kind: "component";
  name: string;
  props: UniversalIRProp[];
  children: UniversalIRNode[];
}

export interface UniversalIRFragment extends UniversalIRBase {
  kind: "fragment";
  children: UniversalIRNode[];
}

export interface UniversalIRText extends UniversalIRBase {
  kind: "text";
  value: string;
}

export interface UniversalIRExpression extends UniversalIRBase {
  kind: "expression";
  source: string;
  static: false;
}

export interface CompileAnalysis {
  ir: UniversalIRNode[];
  serverImports: string[];
  clientImports: string[];
  serverFunctionCount: number;
}

export interface CompileResult extends CompileAnalysis {
  code: string;
  sourceMap?: string;
  diagnostics: readonly ts.Diagnostic[];
}

function tagName(node: ts.JsxTagNameExpression): string {
  return node.getText();
}

function isComponentName(name: string) {
  const first = name[0];
  return first ? first === first.toUpperCase() : false;
}

function readProps(attributes: ts.JsxAttributes, sourceFile: ts.SourceFile): UniversalIRProp[] {
  return attributes.properties.map((attribute) => {
    if (ts.isJsxSpreadAttribute(attribute)) {
      return { name: "...", value: attribute.expression.getText(sourceFile), static: false };
    }

    if (!attribute.initializer) return { name: attribute.name.getText(sourceFile), value: null, static: true };

    if (ts.isStringLiteral(attribute.initializer)) {
      return { name: attribute.name.getText(sourceFile), value: attribute.initializer.text, static: true };
    }

    const expression = attribute.initializer.expression;
    const staticValue = Boolean(
      expression &&
      (ts.isStringLiteral(expression) || ts.isNumericLiteral(expression) || expression.kind === ts.SyntaxKind.TrueKeyword || expression.kind === ts.SyntaxKind.FalseKeyword),
    );

    return {
      name: attribute.name.getText(sourceFile),
      value: expression?.getText(sourceFile) ?? null,
      static: staticValue,
    };
  });
}

function analyzeJsx(node: ts.Node, sourceFile: ts.SourceFile, nextId: () => number): UniversalIRNode | null {
  if (ts.isJsxText(node)) {
    const value = node.getText(sourceFile).replace(/\s+/g, " ").trim();
    if (!value) return null;
    return { kind: "text", id: nextId(), start: node.getStart(sourceFile), end: node.getEnd(), static: true, value };
  }

  if (ts.isJsxExpression(node)) {
    if (!node.expression) return null;
    return {
      kind: "expression",
      id: nextId(),
      start: node.getStart(sourceFile),
      end: node.getEnd(),
      static: false,
      source: node.expression.getText(sourceFile),
    };
  }

  if (ts.isJsxFragment(node)) {
    const children = node.children
      .map((child) => analyzeJsx(child, sourceFile, nextId))
      .filter((child): child is UniversalIRNode => child !== null);
    return {
      kind: "fragment",
      id: nextId(),
      start: node.getStart(sourceFile),
      end: node.getEnd(),
      static: children.every((child) => child.static),
      children,
    };
  }

  if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
    const opening = ts.isJsxElement(node) ? node.openingElement : node;
    const name = tagName(opening.tagName);
    const props = readProps(opening.attributes, sourceFile);
    const rawChildren = ts.isJsxElement(node) ? node.children : [];
    const children = rawChildren
      .map((child) => analyzeJsx(child, sourceFile, nextId))
      .filter((child): child is UniversalIRNode => child !== null);
    const base = {
      id: nextId(),
      start: node.getStart(sourceFile),
      end: node.getEnd(),
      static: props.every((prop) => prop.static) && children.every((child) => child.static),
      props,
      children,
    };

    return isComponentName(name)
      ? { ...base, kind: "component", name }
      : { ...base, kind: "element", tag: name };
  }

  return null;
}

export function analyzeOneStackSource(source: string, fileName = "module.tsx"): CompileAnalysis {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let id = 0;
  const nextId = () => id++;
  const ir: UniversalIRNode[] = [];
  const serverImports: string[] = [];
  const clientImports: string[] = [];
  let serverFunctionCount = 0;

  const visit = (node: ts.Node, insideJsx = false) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const specifier = node.moduleSpecifier.text;
      if (/\.server(?:\.|$)|\/server(?:\/|$)/.test(specifier)) serverImports.push(specifier);
      if (/\.client(?:\.|$)|\/client(?:\/|$)/.test(specifier)) clientImports.push(specifier);
    }

    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "server") {
      serverFunctionCount += 1;
    }

    const jsx = analyzeJsx(node, sourceFile, nextId);
    if (jsx && !insideJsx) {
      ir.push(jsx);
      return;
    }

    ts.forEachChild(node, (child) => visit(child, insideJsx || jsx !== null));
  };

  visit(sourceFile);
  return { ir, serverImports, clientImports, serverFunctionCount };
}

export function compileOneStack(source: string, fileName = "module.tsx"): CompileResult {
  const analysis = analyzeOneStackSource(source, fileName);
  const result = ts.transpileModule(source, {
    fileName,
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      jsx: ts.JsxEmit.ReactJSX,
      jsxImportSource: "@onestack/core",
      sourceMap: true,
    },
  });

  return {
    ...analysis,
    code: result.outputText,
    sourceMap: result.sourceMapText,
    diagnostics: result.diagnostics ?? [],
  };
}
