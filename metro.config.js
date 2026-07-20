// Metro config do VeriFile.
//
// A dependência `react-native-ssi-pq` é um symlink (`file:`) para um pacote que
// vive FORA da árvore do projeto, no monorepo vertex
// (../vertex/ssi-pq-core/packages/react-native). O Metro segue o symlink até o
// caminho real, mas de lá não consegue resolver os peer deps (`react-native`,
// `react`, ...), pois eles estão no node_modules do VeriFile. As duas configs
// abaixo resolvem isso:
//   1. watchFolders  -> Metro passa a observar/empacotar os fontes da lib;
//   2. extraNodeModules -> qualquer módulo pedido de dentro da lib é resolvido
//      a partir do node_modules do VeriFile.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);

const ssiPqLib = path.resolve(
  projectRoot,
  '../vertex/ssi-pq-core/packages/react-native'
);

config.watchFolders = [...(config.watchFolders ?? []), ssiPqLib];

config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules')];

config.resolver.extraNodeModules = new Proxy(
  {},
  {
    get: (_target, name) =>
      path.resolve(projectRoot, 'node_modules', name.toString()),
  }
);

module.exports = config;
