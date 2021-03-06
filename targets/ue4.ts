import * as swagger from 'swagger2';
import * as schema from 'swagger2/src/schema';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as fragments from './ue4/fragments';
import { TargetGenerator } from './TargetGenerator';
import { TargetOptions } from "./TargetOptions";
import { resolveType } from './ue4/typing';
import { convertDefinition, IDefinitionSpec } from './common/typeSpec';
import { IApiSpec, loadApi } from './common/apiSpec';
import { emitMethodResultDelegateDefinition, emitMethodProxyHeaderDeclaration, emitMethodProxyConstructorImplementation, emitMethodProxyCallImplementation } from './ue4/methods';
import { emitDefinitionAndDependencies } from './ue4/definitions';
import { generateUe4Namespace } from './ue4/namespace';
import * as mkdirp from 'mkdirp';
import { isErrorStructure } from './common/error';
import { normalizeTypeName } from './common/normalize';
import { emitMethodWebSocketDeclaration, emitMethodWebSocketDefinition, emitMethodWebSocketCallImplementation } from './ue4/websocket';

export abstract class UnrealEngineGenerator implements TargetGenerator {
  abstract get name(): string;

  get supportsMultitargeting(): boolean {
    return false;
  }

  async generate(documents: {[id: string]: swagger.Document}, opts: TargetOptions): Promise<void> {
    const apis = new Set<IApiSpec>();

    for (const apiId in documents) {
      apis.add(loadApi(apiId, '', documents[apiId], generateUe4Namespace, (definitionSpec) => {
        const ueType = resolveType(definitionSpec);
        return ueType.getNameForDependencyEmit(definitionSpec);
      }));
    }

    await this.makeDirectory(opts, 'Source/HiveMPSDK/Public/Generated');
    await this.makeDirectory(opts, 'Source/HiveMPSDK/Private/Generated');

    const emittedErrorStructures = new Set<string>();

    for (const api of apis) {
      for (const definitionName of api.definitions.keys()) {
        const definitionValue = api.definitions.get(definitionName);
        const ueType = resolveType(definitionValue);

        const normalizedSchemaName = normalizeTypeName(definitionValue.schema);
        if (isErrorStructure(normalizedSchemaName)) {
          if (emittedErrorStructures.has(normalizedSchemaName)) {
            continue;
          } else {
            emittedErrorStructures.add(normalizedSchemaName);
          }
        }

        const structure = ueType.emitStructureDefinition(definitionValue);
        const baseFilename = ueType.getBaseFilenameForDependencyEmit(definitionValue);

        const dependencies = ueType.getDependenciesBaseFilenames(definitionValue);
        let structureHeader = fragments.getCppStructHeader(
          dependencies,
          baseFilename,
          ueType,
          definitionValue);
        let structureCode = fragments.getCppStructCode(
          baseFilename,
          ueType,
          definitionValue);
        if (structure !== null) {
          structureHeader += structure;
          structureHeader += ueType.emitDeserializationHeader(definitionValue);
          structureHeader += ueType.emitSerializationHeader(definitionValue);
          structureCode += ueType.emitDeserializationImplementation(definitionValue);
          structureCode += ueType.emitSerializationImplementation(definitionValue);
        }

        await this.writeFileContent(opts, 'Source/HiveMPSDK/Public/Generated/' + baseFilename + '.h', structureHeader);
        await this.writeFileContent(opts, 'Source/HiveMPSDK/Private/Generated/' + baseFilename + '.cpp', structureCode);

        if (ueType.requiresArrayContainerImplementation(definitionValue)) {
          let arrayContainerHeader = fragments.getCppStructArrayContainerHeader(
            dependencies,
            baseFilename);
          let arrayContainerCode = fragments.getCppStructArrayContainerCode(baseFilename);
          let arrayContainerBPLHeader = fragments.getCppStructArrayContainerBPLHeader(
            dependencies,
            baseFilename);
          let arrayContainerBPLCode = fragments.getCppStructArrayContainerBPLCode(baseFilename);

          arrayContainerHeader += ueType.emitStructureArrayContainerDefinition(definitionValue);
          arrayContainerBPLHeader += ueType.emitStructureArrayContainerBPLDefinition(definitionValue);
          arrayContainerBPLCode += ueType.emitStructureArrayContainerBPLImplementation(definitionValue);

          await this.writeFileContent(opts, 'Source/HiveMPSDK/Public/Generated/ArrayContainer_' + baseFilename + '.h', arrayContainerHeader);
          await this.writeFileContent(opts, 'Source/HiveMPSDK/Private/Generated/ArrayContainer_' + baseFilename + '.cpp', arrayContainerCode);
          await this.writeFileContent(opts, 'Source/HiveMPSDK/Public/Generated/ArrayContainerBPL_' + baseFilename + '.h', arrayContainerBPLHeader);
          await this.writeFileContent(opts, 'Source/HiveMPSDK/Private/Generated/ArrayContainerBPL_' + baseFilename + '.cpp', arrayContainerBPLCode);
        }
      }
      
      for (const method of api.methods) {
        const baseFilename = 'Method_' + method.implementationName;

        let dependencies = new Set<string>();
        if (method.response !== null) {
          const ueType = resolveType(method.response);
          const dep = ueType.getBaseFilenameForDependencyEmit(method.response);
          if (dep !== null) {
            dependencies.add(dep);
          }
        }
        for (const parameter of method.parameters) {
          const ueType = resolveType(parameter);
          const dep = ueType.getBaseFilenameForDependencyEmit(parameter);
          if (dep !== null) {
            dependencies.add(dep);
          }
        }
        if (method.isWebSocket) {
          for (const request of method.webSocketRequestMessageTypes) {
            const ueType = resolveType(request.type);
            const dep = ueType.getBaseFilenameForDependencyEmit(request.type);
            if (dep !== null) {
              dependencies.add(dep);
            }
          }
          for (const response of method.webSocketResponseMessageTypes) {
            const ueType = resolveType(response.type);
            const dep = ueType.getBaseFilenameForDependencyEmit(response.type);
            if (dep !== null) {
              dependencies.add(dep);
            }
          }
        }

        let methodHeader = fragments.getCppMethodHeader(Array.from(dependencies), baseFilename, method.isWebSocket);
        if (method.isWebSocket) {
          methodHeader += emitMethodWebSocketDeclaration(method);
        }
        methodHeader += emitMethodResultDelegateDefinition(method);
        methodHeader += emitMethodProxyHeaderDeclaration(method);

        let methodCode = fragments.getCppMethodCode(baseFilename);
        if (method.isWebSocket) {
          methodCode += emitMethodWebSocketDefinition(method);
        }
        methodCode += emitMethodProxyConstructorImplementation(method);
        if (method.isWebSocket) {
          methodCode += emitMethodWebSocketCallImplementation(method);
        } else {
          methodCode += emitMethodProxyCallImplementation(method);
        }

        await this.writeFileContent(opts, 'Source/HiveMPSDK/Public/Generated/' + baseFilename + '.h', methodHeader);
        await this.writeFileContent(opts, 'Source/HiveMPSDK/Private/Generated/' + baseFilename + '.cpp', methodCode);
      }
    }
    
    const copy = async (source: string, target: string) => {
      await new Promise<void>((resolve, reject) => {
        fs.copy(source, target, { overwrite: true }, (err) => {
          if (err) {
            reject(err);
          }
          resolve();
        });
      });
    };

    const unlink = async (target: string) => {
      await new Promise<void>((resolve, reject) => {
        fs.unlink(target, (err) => {
          if (err) {
            reject(err);
          }
          resolve();
        });
      });
    };

    await copy("sdks/UnrealEngine-Common/", opts.outputDir);
    await copy("sdks/" + this.name + "/", opts.outputDir);
    await copy("client_connect/cchost/", opts.outputDir + "/Source/HiveMPSDK/Private/cchost");
    await copy("client_connect/mujs/", opts.outputDir + "/Source/HiveMPSDK/Private/mujs");
    await copy("client_connect/steam/", opts.outputDir + "/Source/HiveMPSDK/Private/steam");
    await unlink(opts.outputDir + "/Source/HiveMPSDK/Private/mujs/one.c");
    await unlink(opts.outputDir + "/Source/HiveMPSDK/Private/mujs/main.c");
    await unlink(opts.outputDir + "/Source/HiveMPSDK/Private/cchost/connect.h");
    await unlink(opts.outputDir + "/Source/HiveMPSDK/Private/cchost/connect.cpp");
    await unlink(opts.outputDir + "/Source/HiveMPSDK/Private/cchost/embed.ps1");
    await copy("client_connect/polyfill/", opts.outputDir + "/Source/HiveMPSDK/Private/polyfill");
  }

  private writeFileContent(opts: TargetOptions, filename: string, code: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const filepath = path.join(opts.outputDir, filename);
      fs.readFile(filepath, 'utf8', (err, data) => {
        if (err || data !== code) {
          fs.writeFile(filepath, code, (err) => {
            if (err) {
              reject(err);
              return;
            }
            
            resolve();
          });
        } else {
          resolve();
        }
      });
    });
  }

  private makeDirectory(opts: TargetOptions, directory: string) {
    return new Promise((resolve, reject) => {
      mkdirp(path.join(opts.outputDir, directory), (err, made) => {
        if (err) {
          reject(err);
        }
        resolve();
      });
    });
  }
}

export class UnrealEngine418Generator extends UnrealEngineGenerator {
  get name(): string {
    return "UnrealEngine-4.18";
  }
}

export class UnrealEngine419Generator extends UnrealEngineGenerator {
  get name(): string {
    return "UnrealEngine-4.19";
  }
}

export class UnrealEngine420Generator extends UnrealEngineGenerator {
  get name(): string {
    return "UnrealEngine-4.20";
  }
}