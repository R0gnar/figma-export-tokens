const fs = require('fs');
const prompts = require('prompts');
const path = require('path');

const configFileName = '.figma-config.json';
const defaults = {
    token: '',
    file: '',
    tokensPage: 'Page 1',
    colorPrefix: 'Color',
    fontPrefix: 'Font',
    sizePrefix: 'Size',
    spacingPrefix: 'Spacing',
    borderRadiusPrefix: 'Radius',
    borderPrefix: 'Border',
    shadowPrefix: 'Style',
    tokensFilePath: 'styles/_tokens.scss',
    default: false
};

const configList = [
    {
        type: 'text',
        name: 'token',
        message: 'Figma API token:',
        validate: value => value === '' ? 'Generate a personal token for figma, read here:\nhttps://www.figma.com/developers/docs#authentication' : true,
        initial: defaults.token,
    },
    {
        type: 'text',
        name: 'file',
        message: 'Figma file ID:',
        validate: value => value === '' ? 'Visit figma project in the browser and copy the id:\nhttps://www.figma.com/file/FILE-ID/project-name' : true,
        initial: defaults.file,
    },
    {
        type: 'text',
        name: 'tokensPage',
        message: 'Figma page name:',
        validate: value => value === '' ? 'Enter page name' : true,
        initial: defaults.tokensPage,
    },
    {
        type: 'text',
        name: 'colorPrefix',
        message: 'Color prefix:',
        validate: value => value === '' ? 'Enter color prefix' : true,
        initial: defaults.colorPrefix
    },
    {
        type: 'text',
        name: 'fontPrefix',
        message: 'Font prefix:',
        validate: value => value === '' ? 'Enter font prefix' : true,
        initial: defaults.fontPrefix,
    },
    {
        type: 'text',
        name: 'sizePrefix',
        message: 'Size prefix:',
        validate: value => value === '' ? 'Enter size prefix' : true,
        initial: defaults.sizePrefix,
    },
    {
        type: 'text',
        name: 'spacingPrefix',
        message: 'Spacing prefix:',
        validate: value => value === '' ? 'Enter spacing prefix' : true,
        initial: defaults.spacingPrefix,
    },
    {
        type: 'text',
        name: 'borderRadiusPrefix',
        message: 'Border radius prefix:',
        validate: value => value === '' ? 'Enter border radius prefix' : true,
        initial: defaults.borderRadiusPrefix,
    },
    {
        type: 'text',
        name: 'borderPrefix',
        message: 'Border prefix:',
        validate: value => value === '' ? 'Enter border prefix' : true,
        initial: defaults.borderPrefix,
    },
    {
        type: 'text',
        name: 'shadowPrefix',
        message: 'Shadow prefix:',
        validate: value => value === '' ? 'Enter shadow prefix' : true,
        initial: defaults.shadowPrefix,
    },
    {
        type: 'text',
        name: 'tokensFilePath',
        message: 'Tokens file path:',
        validate: value => value === '' ? 'Enter tokens file path' : true,
        initial: defaults.tokensFilePath
    },
    {
        type: 'confirm',
        name: 'default',
        message: 'Add default attr',
        initial: defaults.default
    }
];

function getConfig() {
    return new Promise((resolve, reject) => {
        if (fs.existsSync(configFileName)) {
           let config = JSON.parse(fs.readFileSync(configFileName, 'utf-8'));
           const missing = configList.filter(q => !config[q.name]);
           if (missing.length > 0) {
               getPromptData(missing).then(data => {
                   config = Object.assign(config, data);
                   saveConfig(config);
                   resolve(config);
               }, reject)
           } else {
               resolve(config);
           }
        } else {
            getPromptData(configList).then(config => {
                saveConfig(config);
                resolve(config);
            }, reject);
        }
    });
}

function getPromptData(list) {
    return prompts(list, {onCancel: () => process.exit(1)});
}

function saveConfig(config) {
    fs.writeFileSync(configFileName, JSON.stringify(config, null, 2));
    updateGitIgnore();
}

function updateGitIgnore() {
    const gitignoreFilePath = path.resolve('.gitignore');
    if (!fs.existsSync(gitignoreFilePath)) {
        fs.writeFileSync(gitignoreFilePath, `${configFileName}\n`);
        return;
    }
    const content = fs.readFileSync(gitignoreFilePath, 'utf-8');
    const elements = content.split('\n');
    if (elements.indexOf(configFileName) < 0) {
        fs.writeFileSync(gitignoreFilePath, content + '\n' + configFileName + '\n')
    }
}

module.exports = getConfig;
