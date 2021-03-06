import * as swagger from 'swagger2';
import * as schema from 'swagger2/src/schema';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as fragments from './ts/fragments';
import { TargetGenerator, GeneratorUtility } from './TargetGenerator';
import { TargetOptions } from "./TargetOptions";
import { IApiSpec, loadApi } from './common/apiSpec';
import { emitCommonErrorStructures, isErrorStructure } from './ts/error';
import { resolveType } from './ts/typing';
import { generateTypeScriptNamespace } from './ts/namespace';
import { emitClient } from './ts/clients';
import * as context from './ts/context';

export class TypeScriptGenerator implements TargetGenerator {
  get name(): string {
    return 'TypeScript';
  }

  get supportsMultitargeting(): boolean {
    return false;
  }

  private writeFileContent(opts: TargetOptions, filename: string, code: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      fs.writeFile(path.join(opts.outputDir, filename), code, (err) => {
        if (err) {
          reject(err);
          return;
        }
        
        resolve();
      });
    });
  }

  async generate(documents: {[id: string]: swagger.Document}, opts: TargetOptions): Promise<void> {
    const apis = new Set<IApiSpec>();

    for (const apiId in documents) {
      apis.add(loadApi(apiId, '', documents[apiId], generateTypeScriptNamespace, (definitionSpec) => definitionSpec.name));
    }

    for (const api of apis) {
      for (const definition of api.definitions.values()) {
        context.registerType(definition);
      }
    }
    
    let code = '';
    code += emitCommonErrorStructures(apis.values().next().value);
    for (const api of apis) {
      code += fragments.namespaceBegin(api.namespace);

      for (const definition of api.definitions.values()) {
        if (!isErrorStructure(definition.name)) {
          const csType = resolveType(definition);
          code += csType.emitInterfaceDefinition(definition);
        }
      }

      for (const tag of api.tags.values()) {
        code += emitClient(
          api,
          tag,
          opts);
      }
     
      code += fragments.namespaceEnd;
    }

    code += context.emitSerializerAndDeserializerImplementations();

    code = fragments.getNodeJsHeader() + code;

    await this.writeFileContent(opts, 'index.ts', code);

    if (!opts.skipSupportingFiles) {
      await new Promise<void>((resolve, reject) => {
        fs.mkdirp(opts.outputDir, (err) => {
          if (err) {
            reject(err);
          }
          let src = "sdks/TypeScript";
          fs.copy(src, opts.outputDir, { overwrite: true }, (err) => {
            if (err) {
              reject(err);
            }
            resolve();
          });
        });
      });
    }
  }
}
