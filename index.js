const fs = require('fs');
const FigmaApi = require('./src/figma-api');

const config = {
    token: '',
    file: '1iup5ZTDwC58vRUVwMO9a8',
    pageName: 'Page 1',
    colorPrefix: 'Color',
    spacingPrefix: 'Spacing',
    borderRadiusPrefix: 'Border radius',
    fontPrefix: 'Font',
    borderPrefix: 'Stroke',
    tokensFilePath: 'styles/_tokens.scss'
};

const textDecorationMapping = {
    UNDERLINE: 'underline',
    STRIKETHROUGH: 'line-through'
};

const textCaseMapping = {
    UPPER: 'uppercase',
    LOWER: 'lowercase',
    TITLE: 'capitalize'
};

const client = FigmaApi(config.token);
client.getFile(config.file).then(result => {
    const page = result.document.children.find(c => c.name === config.pageName);
    if (!page) {
        console.error(`Page ${config.pageName} not found`);
        return;
    }
    const variables = [];
    const mixins = [];
    page.children.forEach(item => {
        const nameParts = item.name.split('/');
        const type = nameParts[0].trim();
        let value;
        if (type === config.colorPrefix) {
            value = getRgbColor(item.fills[0].color);
        } else if (type === config.spacingPrefix) {
            value = `${+item.absoluteBoundingBox.height}px`;
        } else if (type === config.borderPrefix) {
            value = `${+item.strokeWeight}px`;
        } else if (type === config.borderRadiusPrefix) {
            value = `${+item.cornerRadius}px`;
        } if (type === config.fontPrefix) {
            const items = [{
                name: 'font',
                value: `${item.style.fontWeight} ${+item.style.fontSize}px/${+item.style.lineHeightPx}px ${item.style.fontFamily}`
            }];
            if (item.style.letterSpacing) {
                items.push({
                    name: 'letter-spacing',
                    value: `${item.style.letterSpacing}px`
                });
            }
            if (textCaseMapping[item.style.textCase]) {
                items.push({
                    name: 'text-transform',
                    value: textCaseMapping[item.style.textCase]
                });
            }
            if (textDecorationMapping[item.style.textDecoration]) {
                items.push({
                    name: 'text-decoration',
                    value: textDecorationMapping[item.style.textDecoration]
                });
            }
            mixins.push({
                name: formatName(item.name),
                value: items
            });
        }
        if (value) {
            variables.push({
                name: formatName(item.name),
                value: value
            });
        }
    });

    const tokens = `${createVariables(variables)}\n${mixins.map(item => createMixin(item.name, item.value)).join('\n')}`;
    fs.writeFile(config.tokensFilePath, tokens, () => {});
});

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

function createMixin(name, items) {
    let str = `@mixin ${name}() {\n`;
    for (const item of items) {
        str += `  ${item.name}${item.name.substr(0, 1) !== '@' ? ':' : ''} ${item.value};\n`;
    }
    str += '}\n';
    return str;
}

function createVariables(data) {
    let str = '';
    for (const item of data) {
        str += `$${item.name}: ${item.value};\n`;
    }
    return str;
}
