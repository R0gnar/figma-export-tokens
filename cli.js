#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const ora = require('ora');
const chalk = require('chalk');
const getConfig = require('./src/config');
const FigmaApi = require('./src/figma-api');

const spinner = ora();

const TYPE_VARIABLE = 'variable';
const TYPE_MIXIN = 'mixin';

const textDecorationMapping = {
    UNDERLINE: 'underline',
    STRIKETHROUGH: 'line-through'
};

const textCaseMapping = {
    UPPER: 'uppercase',
    LOWER: 'lowercase',
    TITLE: 'capitalize'
};

function run() {
    getConfig().then(config => {
        const client = FigmaApi(config.token);
        spinner.start('Fetching Figma file');
        client.getFile(config.file).then(result => {
            spinner.succeed();
            const page = result.document.children.find(c => c.name === config.page);
            if (!page) {
                console.log(chalk.red.bold(`Page ${config.page} not found`));
                return;
            }
            let data = [];
            page.children.forEach(item => {
                const nameParts = item.name.split('/');
                const type = nameParts[0].trim();
                if (type === config.colorPrefix) {
                    data.push(getColorData(item));
                } else if (type === config.spacingPrefix) {
                    data.push(getSpacingData(item));
                } else if (type === config.borderPrefix) {
                    data.push(getBorderData(item));
                } else if (type === config.borderRadiusPrefix) {
                    data.push(getBorderRadiusData(item));
                } if (type === config.fontPrefix) {
                    data.push(getFontData(item));
                }
            });
            data = data.sort((a, b) => a.ordering - b.ordering);
            writeTokens(data, config.tokensFilePath);
        });
    }).catch(error => console.log(error));
}

function writeTokens(data, filePath) {
    const dirname = path.dirname(filePath);
    const basename = path.basename(filePath, '.scss');
    const jsonFile = path.join(dirname, `.${basename}.json`);
    if (fs.existsSync(jsonFile)) {
        let oldData = JSON.parse(fs.readFileSync(jsonFile, 'utf-8'));
        const dataVariables = data.map(item => item.name);
        oldData = oldData.filter(item => dataVariables.indexOf(item.name) === -1)
            .map(item => ({...item, deleted: true}));
        data = [...data, ...oldData];
    }
    fs.writeFileSync(jsonFile, JSON.stringify(data, null, 2));
    fs.writeFileSync(filePath, getScssTokens(data));
}

function getScssTokens(data) {
    return data.map(item => {
        if (item.type === TYPE_VARIABLE) {
            return createVariable(item.name, item.value, item.deleted);
        } else if (item.type === TYPE_MIXIN) {
            return createMixin(item.name, item.value, item.deleted);
        }
    }).join('\n') + '\n';
}

function getColorData(node) {
    return {
        ordering: 1,
        type: TYPE_VARIABLE,
        name: formatName(node.name),
        value: getRgbColor(node.fills[0].color)
    };
}

function getSpacingData(node) {
    return {
        ordering: 2,
        type: TYPE_VARIABLE,
        name: formatName(node.name),
        value: `${+node.absoluteBoundingBox.height}px`
    };
}

function getBorderData(node) {
    return {
        ordering: 3,
        type: TYPE_VARIABLE,
        name: formatName(node.name),
        value: `${+node.strokeWeight}px`
    };
}

function getBorderRadiusData(node) {
    return {
        ordering: 4,
        type: TYPE_VARIABLE,
        name: formatName(node.name),
        value: `${+node.cornerRadius}px`
    };
}

function getFontData(node) {
    const items = [{
        name: 'font',
        value: `${node.style.fontWeight} ${+node.style.fontSize}px/${+node.style.lineHeightPx}px ${node.style.fontFamily}`
    }];
    if (node.style.letterSpacing) {
        items.push({
            name: 'letter-spacing',
            value: `${+node.style.letterSpacing}px`
        });
    }
    if (textCaseMapping[node.style.textCase]) {
        items.push({
            name: 'text-transform',
            value: textCaseMapping[node.style.textCase]
        });
    }
    if (textDecorationMapping[node.style.textDecoration]) {
        items.push({
            name: 'text-decoration',
            value: textDecorationMapping[node.style.textDecoration]
        });
    }
    return {
        ordering: 5,
        type: TYPE_MIXIN,
        name: formatName(node.name),
        value: items
    };
}


function formatName(name) {
    return name.split('/')
        .map(item => item.trim())
        .join(' ')
        .replace(/[^/w[0-9]\s]/ig, '')
        .replace(/\s/ig, '-')
        .toLowerCase()
}

function getRgbColor(rgb) {
    return `#${componentToHex(255 * rgb.r)}${componentToHex(255 * rgb.g)}${componentToHex(255 * rgb.b)}`;
}

function componentToHex(c) {
    c = Math.round(c);
    const hex = c.toString(16);
    return hex.length === 1 ? `0${hex}` : hex;
}

function createMixin(name, value, deleted = false) {
    let str = '';
    if (deleted) {
        str += '/** @deprecated */\n';
    }
    str += `@mixin ${name}() {\n`;
    for (const item of value) {
        str += `  ${item.name}${item.name.substr(0, 1) !== '@' ? ':' : ''} ${item.value};\n`;
    }
    str += '}';
    return str;
}

function createVariable(name, value, deleted = false) {
    let str = '';
    if (deleted) {
        str += '/** @deprecated */\n';
    }
    str += `$${name}: ${value};`;
    return str;
}

run();
