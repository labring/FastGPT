# Quick Introduction

Due to the limitations of environment variables for configuring complex content, the new version of FastGPT utilizes ConfigMap to mount configuration files. You can find the default configuration file at `client/data/config.json`. You can refer to the [docker-compose deployment guide](/docs/develop/deploy/docker) to learn how to mount configuration files.

In the development environment, you need to create a copy of `config.json` named `config.local.json` for it to take effect.

This configuration file includes customization for the front-end interface, system-level parameters, AI conversation models, and more.

## Brief Explanation of Basic Fields

Here are some explanations for basic configuration fields.

```json
// This configuration controls certain front-end styles
"FeConfig": {
    "show_emptyChat": true, // Display introduction page when chat content is empty
    "show_register": false, // Display registration buttons (including forget password, account registration, and third-party logins)
    "show_appStore": false, // Display application marketplace (permissions are not fully implemented yet)
    "show_userDetail": false, // Display user details (account balance, OpenAI binding)
    "show_git": true, // Display Git link
    "systemTitle": "FastGPT", // System title
    "authorText": "Made by FastGPT Team.", // Signature
    "gitLoginKey": "" // Git login key
}
```

```json
// This configuration file includes system-level parameters
"SystemParams": {
    "gitLoginSecret": "", // Git login key
    "vectorMaxProcess": 15, // Maximum processes for vector generation; set based on database performance and key
    "qaMaxProcess": 15,  // Maximum processes for QA generation; set based on database performance and key
    "pgIvfflatProbe": 20  // PG vector search probe; ignore if no index is set, usually necessary for more than 500,000 entries
  },
```

These are just a few examples of the configuration options available in the `config.json` file of FastGPT. The configurations mentioned here control aspects of the front-end interface and system behavior. The complete configuration file can be tailored to your specific needs for the FastGPT application.