#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const ora = require('ora');
const chalk = require('chalk');
const prompts = require('prompts');
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

    const removeEmoji = /(\u00a9|\u00ae|[\u2000-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff])/gi;
    const page = pages.document.children.find(c => c.name.replace(removeEmoji, '') === config.tokensPage);
    if (!page) {
        console.log(chalk.red.bold(`Page ${config.tokensPage} not found`));
        return;
    }
    spinner.start('Fetching Figma file tokens');
    const pageData = await client.getFile(config.file, {ids: page.id, depth: 2});
    spinner.succeed();
    const elements = pageData.document.children.find(c => c.id === page.id).children;
    let data = [];
    const fontFamilies = {};
    elements.forEach(item => {
        const nameParts = item.name.split('-');
        const type = nameParts[0].trim();
        if (type === config.fontPrefix) {
            if (!fontFamilies[item.style.fontFamily]) {
                fontFamilies[item.style.fontFamily] = 0;
            }
            fontFamilies[item.style.fontFamily]++;
        }
    });
    const fontFamilyBase = Object.keys(fontFamilies)
        .sort((a, b) => fontFamilies[a] > fontFamilies[b] ? -1 : 1)[0];
    data.push({
        ordering: 7,
        type: TYPE_VARIABLE,
        name: 'font-family-base',
        value: fontFamilyBase
    });
    elements.forEach(item => {
        const nameParts = item.name.split('-');
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
            data = data.concat(getFontData(item, fontFamilyBase));
        } else if (type === config.shadowPrefix) {
            data.push(getShadowData(item));
        }
    });
    data = data.sort((a, b) => a.ordering === b.ordering ? a.name > b.name ? 1 : -1 : a.ordering - b.ordering);
    writeTokens(data, config.tokensFilePath, config.default);
}

function writeTokens(data, filePath, defaultAttr) {
    const dirname = path.dirname(filePath);
    if (!fs.existsSync(dirname)) {
        fs.mkdirSync(dirname, {recursive: true});
    }
    const basename = path.basename(filePath, '.scss');
    const jsonFile = path.join(dirname, `.${basename}.json`);
    let oldData = []
    if (fs.existsSync(jsonFile)) {
        oldData = JSON.parse(fs.readFileSync(jsonFile, 'utf-8'));
        const dataVariables = data.map(item => item.name);
        oldData = oldData.filter(item => dataVariables.indexOf(item.name) === -1)
            .map(item => ({...item, deleted: true}));
    }
    const promtsList = oldData.map(item => ({
        type: 'confirm',
        name: item.name,
        message: `${item.name} was deleted. Keep style in scss tokens?`
    }));

    prompts(promtsList, {onCancel: () => process.exit(1)}).then(result => {
        oldData = oldData.filter(item => result[item.name]);
        data = [...data, ...oldData];
        fs.writeFileSync(jsonFile, JSON.stringify(data, null, 2));
        fs.writeFileSync(filePath, getScssTokens(data, defaultAttr));
    });
}

function getScssTokens(data, defaultAttr) {
    return data.map(item => {
        if (item.type === TYPE_VARIABLE) {
            return createVariable(item.name, item.value, item.deleted, defaultAttr);
        } else if (item.type === TYPE_MIXIN) {
            return createMixin(item.name, item.value, item.deleted, defaultAttr);
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

function getFontData(node, fontFamilyBase) {
    const mixinName = formatName(node.name);
    const variables = [
        {name: `${mixinName}-font-weight`, value: node.style.fontWeight || 500},
        {name: `${mixinName}-font-size`, value: `${Math.round(node.style.fontSize)}px`},
        {name: `${mixinName}-line-height`, value: `${Math.round(node.style.lineHeightPx)}px`}
    ];
    let fontFamily = 'font-family-base';
    if (node.style.fontFamily !== fontFamilyBase) {
        fontFamily = `${mixinName}-font-family`;
        variables.push({
            name: fontFamily,
            value: node.style.fontFamily
        });
    }
    const items = [{
        name: 'font',
        value: `$${mixinName}-font-weight $${mixinName}-line-height/$${mixinName}-line-height $${fontFamily}`
    }];
    if (node.style.letterSpacing) {
        const name = `${mixinName}-letter-spacing`;
        variables.push({
            name,
            value: `${+node.style.letterSpacing}px`
        });
        items.push({
            name: 'letter-spacing',
            value: `$${name}`
        });
    }
    if (textCaseMapping[node.style.textCase]) {
        const name = `${mixinName}-text-transform`;
        variables.push({
            name: name,
            value: textCaseMapping[node.style.textCase]
        });
        items.push({
            name: 'text-transform',
            value: `$${name}`
        });
    }
    if (textDecorationMapping[node.style.textDecoration]) {
        const name = `${mixinName}-text-decoration`;
        variables.push({
            name,
            value: textDecorationMapping[node.style.textDecoration]
        });
        items.push({
            name: 'text-decoration',
            value: textDecorationMapping[node.style.textDecoration]
        });
    }
    return variables.map(item => ({...item, ordering: 7, type: TYPE_VARIABLE}))
        .concat([{
            ordering: 7.5,
            type: TYPE_MIXIN,
            name: formatName(node.name),
            value: items
        }]);
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

function createVariable(name, value, deleted = false, defaultAttr = false) {
    let str = '';
    if (deleted) {
        str += '/** @deprecated */\n';
    }
    str += `$${name}: ${value}${defaultAttr ? '!default' : ''};`;
    return str;
}

function main() {
    run().then().catch(err => {
        console.error('Error: ', err);
        spinner.fail();
    })
}

main();
