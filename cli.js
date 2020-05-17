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

async function run() {
    const config = await getConfig();
    const client = FigmaApi(config.token);
    spinner.start('Fetching Figma file pages');
    const pages = await client.getFile(config.file, {depth: 1});
    spinner.succeed();
    const page = pages.document.children.find(c => c.name === config.tokensPage);
    if (!page) {
        console.log(chalk.red.bold(`Page ${config.page} not found`));
        return;
    }
    spinner.start('Fetching Figma file tokens');
    const pageData = await client.getFile(config.file, {ids: page.id, depth: 2});
    spinner.succeed();
    const elements = pageData.document.children.find(c => c.id === page.id).children;
    let data = [];
    elements.forEach(item => {
        const nameParts = item.name.split('/');
        const type = nameParts[0].trim();
        if (type === config.colorPrefix) {
            data.push(getColorData(item));
        } else if (type === config.sizePrefix) {
            data.push(getSizeData(item));
        } else if (type === config.spacingPrefix) {
            data.push(getSpacingData(item));
        } else if (type === config.borderPrefix) {
            data.push(getBorderData(item));
        } else if (type === config.borderRadiusPrefix) {
            data.push(getBorderRadiusData(item));
        } else if (type === config.fontPrefix) {
            data.push(getFontData(item));
        } else if (type === config.shadowPrefix) {
            data.push(getShadowData(item));
        }
    });
    data = data.sort((a, b) => a.ordering - b.ordering);
    writeTokens(data, config.tokensFilePath);
}

function writeTokens(data, filePath) {
    const dirname = path.dirname(filePath);
    if (!fs.existsSync(dirname)) {
        fs.mkdirSync(dirname, {recursive: true});
    }
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
        value: getColor(node)
    };
}

function getSizeData(node) {
    return {
        ordering: 2,
        type: TYPE_VARIABLE,
        name: formatName(node.name),
        value: `${+node.absoluteBoundingBox.height}px`
    };
}

function getSpacingData(node) {
    return {
        ordering: 3,
        type: TYPE_VARIABLE,
        name: formatName(node.name),
        value: `${+node.absoluteBoundingBox.height}px`
    };
}

function getBorderData(node) {
    return {
        ordering: 4,
        type: TYPE_VARIABLE,
        name: formatName(node.name),
        value: `${+node.strokeWeight}px`
    };
}

function getBorderRadiusData(node) {
    return {
        ordering: 5,
        type: TYPE_VARIABLE,
        name: formatName(node.name),
        value: `${+node.cornerRadius}px`
    };
}

function getShadowData(node) {
    return {
        ordering: 6,
        type: TYPE_VARIABLE,
        name: formatName(node.name),
        value: getShadow(node)
    }
}

function getFontData(node) {
    const items = [{
        name: 'font',
        value: `${node.style.fontWeight} ${Math.round(node.style.fontSize)}px/${Math.round(node.style.lineHeightPx)}px ${node.style.fontFamily}`
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
        ordering: 7,
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

function getColor(node) {
    const fill = node.fills[0];
    const rgb = fill.color;
    if (fill.opacity && fill.opacity < 1) {
        rgb.a = fill.opacity;
    }
    if (rgb.a < 1) {
        return getRgbaColor(rgb);
    }
    return `#${componentToHex(255 * rgb.r)}${componentToHex(255 * rgb.g)}${componentToHex(255 * rgb.b)}`;
}

function getRgbaColor(rgba) {
    return `rgba(${Math.round(255 * rgba.r)}, ${Math.round(255 * rgba.g)}, ${Math.round(255 * rgba.b)}, ${Math.round(100 * rgba.a) / 100})`;
}

function componentToHex(c) {
    c = Math.round(c);
    const hex = c.toString(16);
    return hex.length === 1 ? `0${hex}` : hex;
}

function getShadow(node) {
    const effect = node.effects[0];
    return `${+effect.offset.x}px ${+effect.offset.y}px ${+effect.radius}px ${getRgbaColor(effect.color)}`;
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

function main() {
    run().then().catch(err => {
        console.error('Error: ', err);
        spinner.fail();
    })
}

main();
