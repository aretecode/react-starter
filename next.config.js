/**
 * @todo might be able to put more of these in build-time only
 * @see https://github.com/zeit/next.js/issues/876
 */
const withTypescript = require('@zeit/next-typescript')
const withOffline = require('next-offline')

/**
 * @description Make sure any symlinks in the project folder are resolved:
 * @see  https://github.com/facebookincubator/create-react-app/issues/637
 */
const { resolve, join } = require('path')
const { realpathSync } = require('fs')
const appDirectory = realpathSync(process.cwd())
const resolveApp = relativePath => resolve(appDirectory, relativePath)

/**
 * @see https://zeit.co/examples/nextjs/
 * @see https://zeit.co/docs/v2/deployments/ignoring-source-paths
 * @see https://github.com/hanford/next-offline/tree/master/examples/now2
 *
 * @see https://nextjs.org/docs#build-time-configuration
 */
const nextConfig = {
  target:
    process.env.DISABLE_SERVERLESS !== undefined ? 'server' : 'serverless',
  webpack(config, options) {
    if (process.env.NODE_ENV === 'production') {
      console.debug('[next] in production mode, not type checking')
      config.optimization = {
        ...config.optimization,
        removeAvailableModules: true,
        removeEmptyChunks: true,
        mergeDuplicateChunks: true,
        occurrenceOrder: true,
        sideEffects: true,
        usedExports: true,
        providedExports: true,
        concatenateModules: true,
        nodeEnv: 'production',
      }

      return config
    } else if (options.isServer) {
      console.debug('[next] not type checking server')
      return config
    } else {
      console.debug('[next] in development mode, type checking')
    }

    const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin')
    const plugin = new ForkTsCheckerWebpackPlugin({
      tsconfig: require.resolve('./tsconfig.json'),
      tslint: require.resolve('./tslint.json'),
      useTypescriptIncrementalApi: true,
      checkSyntacticErrors: true,
      watch: [resolveApp('src'), resolveApp('pages')],
      reportFiles: [
        // only src, not __tests__
        'src/**/*.{ts,tsx}',
        '!**/__tests__/*',
      ],
    })
    config.plugins.push(plugin)

    return config
  },
  workboxOpts: {
    swDest: 'static/service-worker.js',
    runtimeCaching: [
      {
        urlPattern: /^https?.*/,
        handler: 'networkFirst',
        options: {
          cacheName: 'https-calls',
          networkTimeoutSeconds: 15,
          expiration: {
            maxEntries: 150,
            maxAgeSeconds: 30 * 24 * 60 * 60, // 1 month
          },
          cacheableResponse: {
            statuses: [0, 200],
          },
        },
      },
    ],
  },
}

const typescriptConfig = withTypescript(nextConfig)
const workboxConfig = withOffline(typescriptConfig)

function withBuildTimeDeps() {
  const withSize = require('next-size')
  const withBundleAnalyzer = require('@zeit/next-bundle-analyzer')
  const sizeConfig = withSize(workboxConfig)
  return withBundleAnalyzer({
    ...sizeConfig,
    analyzeServer: ['server', 'both'].includes(process.env.BUNDLE_ANALYZE),
    analyzeBrowser: ['browser', 'both'].includes(process.env.BUNDLE_ANALYZE),
    bundleAnalyzerConfig: {
      server: {
        analyzerMode: 'static',
        reportFilename: '../../bundles/server.html',
      },
      browser: {
        analyzerMode: 'static',
        reportFilename: '../bundles/client.html',
      },
    },
  })
}

module.exports =
  process.env.IS_DOCKER === undefined ? withBuildTimeDeps() : workboxConfig
