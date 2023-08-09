---
sidebar_position: 1
---

# Quick Introduction

Due to the limitations of environment variables in configuring complex content, the new version of FastGPT uses ConfigMap to mount configuration files. You can find the default configuration file at client/data/config.json.
In the development environment, you need to make a copy of config.json as config.local.json for it to take effect.
This configuration file includes customization of the frontend page, system-level parameters, and AI dialogue models, etc.

## Brief Explanation of Basic Fields

Here, we will introduce some basic configuration fields.

```json
// This configuration controls some styles of the frontend
"FeConfig": {
"show_emptyChat": true, // Whether to display the introduction page when the conversation page is empty
"show_register": false, // Whether to display the registration button (including forget password, register account, and third-party login)
"show_appStore": false, // Whether to display the app store (currently the permissions are not properly set, so it is useless to open it)
"show_userDetail": false, // Whether to display user details (account balance, OpenAI binding)
"show_git": true, // Whether to display Git
"systemTitle": "FastAI", // The title of the system
"authorText": "Made by FastAI Team.", // Signature
"gitLoginKey": "" // Git login credentials
}
```

```json
// This configuration file contains system-level parameters
"SystemParams": {
"gitLoginSecret": "", // Git login credentials
"vectorMaxProcess": 15, // Maximum number of processes for vector generation, set in combination with database performance and key
"qaMaxProcess": 15,  // Maximum number of processes for QA generation, set in combination with database performance and key
"pgIvfflatProbe": 20  // pg vector search probe. Can be ignored before setting up the index, usually only needed for more than 500,000 groups.
},
```
