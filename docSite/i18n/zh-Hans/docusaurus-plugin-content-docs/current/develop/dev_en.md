# Local Development

For the initial development, you need to deploy the database first. It's recommended to use a lightweight 2-core 2GB RAM database instance for local development. You can follow the database deployment guide here: [Docker Quick Deployment](/docs/develop/deploy/docker)

The core code of FastGPT is located in the `client` directory. The Next.js framework combines frontend and backend together, and the API services are located in `src/pages/api`.

## Initial Configuration

**1. Environment Variables**

Copy the `.env.template` file to create an `.env.local` file for environment variables. Modify the contents in the `.env.local` file to set effective variables. Refer to `.env.template` for variable explanations.

**2. Config File**

Copy the `data/config.json` file to create a `data/config.local.json` configuration file.

Most of the time, you won't need to modify this file. Only pay attention to the parameters in the `SystemParams` section:

```
"vectorMaxProcess": Maximum processes for vector generation, typically around 120 for a single core, adjust to 10~15 for a 2-core 4GB RAM server.
"qaMaxProcess": Maximum processes for QA generation.
"pgIvfflatProbe": PG vector search probe, can be ignored if no vector index is added.
```

## Running the Project

```bash
cd client
pnpm i
pnpm dev
```

## Building Docker Image

```bash
docker build -t c121914yu/fastgpt .
```