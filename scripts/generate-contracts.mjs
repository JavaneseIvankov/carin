import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const requireApp = createRequire(join(root, 'carin-app/package.json'));
const { default: openapiTS, astToString } = requireApp('openapi-typescript');
const ts = requireApp('typescript');
const prettier = requireApp('prettier');
const prettierConfig = await prettier.resolveConfig(join(root, 'carin-app/.prettierrc'));
prettierConfig.plugins = prettierConfig.plugins.map((plugin) => requireApp.resolve(plugin));
const header =
  '// Generated from specs/contracts/. Do not edit; run pnpm contracts:generate in carin-app.\n';

export async function generateContracts() {
  const python =
    process.env.CONTRACTS_PYTHON ??
    (existsSync(join(root, '.venv/bin/python')) ? join(root, '.venv/bin/python') : 'python3');
  const bundle = JSON.parse(
    execFileSync(python, ['-B', join(root, 'scripts/contract_bundle.py')], {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    })
  );
  const artifacts = {};
  for (const [name, document] of Object.entries(bundle.documents)) {
    const ast = await openapiTS(document, {
      alphabetize: true,
      exportType: true,
      transform(schema) {
        if (schema.format === 'binary') {
          return ts.factory.createTypeReferenceNode(ts.factory.createIdentifier('Blob'));
        }
      },
    });
    const content = header + astToString(ast);
    const filename = name === 'app' ? 'app-api' : 'ai-service';
    artifacts[`carin-app/lib/api/generated/${filename}.ts`] = content;
    artifacts[`carin-api/src/contracts/generated/${filename}.ts`] = content;
  }
  const appOperations = Object.fromEntries(
    Object.entries(bundle.operations)
      .filter(([name]) => name.startsWith('app.'))
      .map(([name, operation]) => [
        name.slice(4),
        {
          method: operation.method.toUpperCase(),
          path: operation.path,
          contentType: Object.keys(operation.request?.content ?? {})[0] ?? null,
        },
      ])
  );
  artifacts['carin-app/lib/api/generated/operations.ts'] =
    `${header}export const appOperations = ${JSON.stringify(appOperations, null, 2)} as const;\n`;
  const { documents: _documents, ...runtime } = bundle;
  artifacts['carin-api/src/contracts/generated/schemas.ts'] =
    `${header}export const contracts = ${JSON.stringify(runtime, null, 2)};\n`;
  for (const [filename, content] of Object.entries(artifacts)) {
    artifacts[filename] = await prettier.format(content, {
      ...prettierConfig,
      parser: 'typescript',
    });
  }
  return artifacts;
}

export async function writeArtifacts(artifacts, outputRoot = root, check = false) {
  const drift = [];
  for (const [relative, content] of Object.entries(artifacts)) {
    const filename = join(outputRoot, relative);
    if (check) {
      const actual = await readFile(filename, 'utf8').catch((error) => {
        if (error.code === 'ENOENT') return null;
        throw error;
      });
      if (actual !== content) drift.push(relative);
    } else {
      await mkdir(dirname(filename), { recursive: true });
      await writeFile(filename, content);
    }
  }
  if (drift.length)
    throw new Error(
      `Generated contract drift:\n${drift.join('\n')}\nRun pnpm contracts:generate in carin-app and commit the output.`
    );
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const check = process.argv.includes('--check');
  await writeArtifacts(await generateContracts(), root, check);
  process.stdout.write(
    check ? 'Generated contracts match OpenAPI.\n' : 'Generated app/AI types and runtime schemas.\n'
  );
}
