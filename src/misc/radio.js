const fetch = require('node-fetch');

exports.getIceStats = (url) => {

const json = await fetch(url).then((r) => r.json());

    return json;
}