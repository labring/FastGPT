const path = require('path')

const dir = path.join(__dirname)

process.env.NODE_ENV = 'production'
process.chdir(__dirname)

// Make sure commands gracefully respect termination signals (e.g. from Docker)
// Allow the graceful termination to be manually configurable
if (!process.env.NEXT_MANUAL_SIG_HANDLE) {
  process.on('SIGTERM', () => process.exit(0))
  process.on('SIGINT', () => process.exit(0))
}

const currentPort = parseInt(process.env.PORT, 10) || 3000
const hostname = process.env.HOSTNAME || '0.0.0.0'

let keepAliveTimeout = parseInt(process.env.KEEP_ALIVE_TIMEOUT, 10)
const nextConfig = {
  "env": {}, "eslint": { "ignoreDuringBuilds": false },
  "typescript": {
    "ignoreBuildErrors": false,
    "tsconfigPath": "tsconfig.json"
  },
  "distDir": "./.next",
  "cleanDistDir": true,
  "assetPrefix": "",
  "configOrigin": "next.config.js",
  "useFileSystemPublicRoutes": true,
  "generateEtags": true,
  "pageExtensions": ["tsx", "ts", "jsx", "js"],
  "poweredByHeader": true,
  "compress": true,
  "analyticsId": "",
  "images": {
    "deviceSizes": [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    "imageSizes": [16, 32, 48, 64, 96, 128, 256, 384],
    "path": "/_next/image",
    "loader": "default",
    "loaderFile": "",
    "domains": [],
    "disableStaticImages": false,
    "minimumCacheTTL": 60,
    "formats": ["image/webp"],
    "dangerouslyAllowSVG": false,
    "contentSecurityPolicy": "script-src 'none'; frame-src 'none'; sandbox;",
    "contentDispositionType": "inline",
    "remotePatterns": [],
    "unoptimized": false
  },
  "devIndicators": {
    "buildActivity": true,
    "buildActivityPosition": "bottom-right"
  },
  "onDemandEntries": {
    "maxInactiveAge": 60000,
    "pagesBufferLength": 5
  },
  "amp":
    { "canonicalBase": "" },
  "basePath": "",
  "sassOptions": {},
  "trailingSlash": false,
  "i18n": {
    "defaultLocale": "zh", "locales": ["zh", "en", "zh-Hans", "zh-CN"],
    "localeDetection": false
  },
  "productionBrowserSourceMaps": false,
  "optimizeFonts": true, "excludeDefaultMomentLocales": true,
  "serverRuntimeConfig": {},
  "publicRuntimeConfig": {}, "reactProductionProfiling": false,
  "reactStrictMode": true, "httpAgentOptions": { "keepAlive": true },
  "outputFileTracing": true, "staticPageGenerationTimeout": 60,
  "swcMinify": true, "output": "standalone",
  "modularizeImports": {
    "@mui/icons-material":
      { "transform": "@mui/icons-material/{{member}}" },
    "date-fns": { "transform": "date-fns/{{member}}" },
    "lodash": { "transform": "lodash/{{member}}" },
    "lodash-es": { "transform": "lodash-es/{{member}}" },
    "ramda": { "transform": "ramda/es/{{member}}" },
    "react-bootstrap": {
      "transform":
        { "useAccordionButton": "modularize-import-loader?name=useAccordionButton&from=named&as=default!react-bootstrap/AccordionButton", "*": "react-bootstrap/{{member}}" }
    }, "antd": { "transform": "antd/lib/{{kebabCase member}}" }, "ahooks": { "transform": { "createUpdateEffect": "modularize-import-loader?name=createUpdateEffect&from=named&as=default!ahooks/es/createUpdateEffect", "*": "ahooks/es/{{member}}" } }, "@ant-design/icons": { "transform": { "IconProvider": "modularize-import-loader?name=IconProvider&from=named&as=default!@ant-design/icons", "createFromIconfontCN": "@ant-design/icons/es/components/IconFont", "getTwoToneColor": "modularize-import-loader?name=getTwoToneColor&from=named&as=default!@ant-design/icons/es/components/twoTonePrimaryColor", "setTwoToneColor": "modularize-import-loader?name=setTwoToneColor&from=named&as=default!@ant-design/icons/es/components/twoTonePrimaryColor", "*": "@ant-design/icons/lib/icons/{{member}}" } }, "next/server": { "transform": "next/dist/server/web/exports/{{ kebabCase member }}" }
  }, "experimental": { "serverMinification": true, "serverSourceMaps": false, "caseSensitiveRoutes": false, "useDeploymentId": false, "useDeploymentIdServerActions": false, "clientRouterFilter": true, "clientRouterFilterRedirects": false, "fetchCacheKeyPrefix": "", "middlewarePrefetch": "flexible", "optimisticClientCache": true, "manualClientBasePath": false, "cpus": 7, "memoryBasedWorkersCount": false, "sharedPool": true, "isrFlushToDisk": true, "workerThreads": false, "optimizeCss": false, "nextScriptWorkers": false, "scrollRestoration": false, "externalDir": false, "disableOptimizedLoading": false, "gzipSize": true, "craCompat": false, "esmExternals": true, "isrMemoryCacheSize": 52428800, "fullySpecified": false, "outputFileTracingRoot": "E:\\code-resources\\FastGPT\\", "swcTraceProfiling": false, "forceSwcTransforms": false, "largePageDataBytes": 128000, "adjustFontFallbacks": false, "adjustFontFallbacksWithSizeAdjust": false, "typedRoutes": false, "instrumentationHook": false, "serverComponentsExternalPackages": ["mongoose"], "optimizePackageImports": ["lucide-react", "@headlessui/react", "@headlessui-float/react", "@heroicons/react/20/solid", "@heroicons/react/24/solid", "@heroicons/react/24/outline", "@visx/visx", "@tremor/react", "rxjs", "@mui/material", "recharts", "@material-ui/core", "react-use", "@material-ui/icons", "@tabler/icons-react", "mui-core", "react-icons/ai", "react-icons/bi", "react-icons/bs", "react-icons/cg", "react-icons/ci", "react-icons/di", "react-icons/fa", "react-icons/fa6", "react-icons/fc", "react-icons/fi", "react-icons/gi", "react-icons/go", "react-icons/gr", "react-icons/hi", "react-icons/hi2", "react-icons/im", "react-icons/io", "react-icons/io5", "react-icons/lia", "react-icons/lib", "react-icons/lu", "react-icons/md", "react-icons/pi", "react-icons/ri", "react-icons/rx", "react-icons/si", "react-icons/sl", "react-icons/tb", "react-icons/tfi", "react-icons/ti", "react-icons/vsc", "react-icons/wi"], "trustHostHeader": false },
  "configFileName": "next.config.js",
  "transpilePackages": ["@fastgpt/*"]
}

process.env.__NEXT_PRIVATE_STANDALONE_CONFIG = JSON.stringify(nextConfig)
process.env.__NEXT_PRIVATE_PREBUNDLED_REACT = false
  ? 'experimental'
  : 'next'

require('next')
const { startServer } = require('next/dist/server/lib/start-server')

if (
  Number.isNaN(keepAliveTimeout) ||
  !Number.isFinite(keepAliveTimeout) ||
  keepAliveTimeout < 0
) {
  keepAliveTimeout = undefined
}

startServer({
  dir,
  isDev: false,
  config: nextConfig,
  hostname,
  port: currentPort,
  allowRetry: false,
  keepAliveTimeout,
  useWorkers: true,
}).catch((err) => {
  console.error(err);
  process.exit(1);
});