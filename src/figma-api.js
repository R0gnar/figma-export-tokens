const axios = require('axios');
const figmaApiBase = 'https://api.figma.com/v1';

const FigmaApi = (token) => {
    const instance = axios.create({
        baseURL: figmaApiBase
    });

    instance.interceptors.request.use((conf) => {
       conf.headers = {
           'Content-Type': 'application/json',
           'X-Figma-Token': token
       };
       return conf;
    });

    return {
        getFile: (fileId) => {
            return instance.get(`/files/${fileId}`).then(response => response.data);
        }
    }
};

module.exports = FigmaApi;
