const fetch = require('node-fetch');

exports.getIceStats = async(url) => {
    const json = await fetch(url).then((r) => r.json());

    return json;
};
