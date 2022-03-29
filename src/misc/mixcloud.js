const fetch = require('node-fetch');

exports.getMixcloudInfo = (mixID) => {
    const url = new URL('https://api.mixcloud.com/' + mixID);

    return fetch(url.toString())
        .then((r) => r.json())
        return r;
}
