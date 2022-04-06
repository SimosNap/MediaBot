const Koa = require('koa');
const KoaRouter = require('koa-router');
const koaBody = require('koa-body');
const fetch = require('node-fetch');

const utils = require('../misc/utils.js');
const Channel = require('../lib/channel');
const ircPromises = require('../lib/ircPromises');

module.exports = class HttpAPI {
    constructor(bot, config, channels, dbCon) {
        this.bot = bot;
        this.channels = channels;
        this.dbCon = dbCon;

        this.inProgress = Object.create(null);

        this.koa = new Koa();

        this.koa.use(koaBody());

        this.api = new KoaRouter({
            prefix: '/api',
        });

        this.api.post('/add/bot', this.handleAddBot.bind(this));
        this.api.post('/set/radio', this.handleSetRadio.bind(this));
        this.api.post('/set/radio/advertise', this.handleSetRadioAdv.bind(this));
        this.api.post('/set/radio/nowplay', this.handleSetRadioNp.bind(this));
        this.api.post('/set/radio/requests', this.handleSetRadioReq.bind(this));

        this.koa.use(this.api.routes());
        this.koa.use(this.api.allowedMethods());

        // this.koa.listen(3000, '127.0.0.1');
        this.koa.listen(3000);
    }

    async handleAddBot(ctx) {
        const newChan = ctx.request?.body?.channel;

        if (this.inProgress.chanJoin) {
            ctx.response.status = 500;
            ctx.response.body = 'channel Join already in progress';
            return;
        }
        this.inProgress.chanJoin = true;

        const failValidation = (message) => {
            delete this.inProgress.chanJoin;
            ctx.throw(400, message);
        };

        if (!newChan) {
            return failValidation('channel required');
        }

        const chan = this.channels[newChan.toLowerCase()];
        console.log(chan);

        if (chan) {
            return failValidation('channel already exist');
        }

        try {
            const chan = new Channel(this.bot, newChan);
            chan[chan.name] = chan;
            const addedChan = await ircPromises.joinChan(this.bot, chan, this.dbCon);
            ctx.response.status = 200;
            ctx.response.body = { channel: addedChan };
        } catch (err) {
            ctx.response.status = 500;
            ctx.response.body = err;
        }

        delete this.inProgress.chanJoin;
    }

    async handleSetRadio(ctx) {
        const mbID = ctx.request?.body?.mbID;
        const channel = ctx.request?.body?.channel;
        const radioname = ctx.request?.body?.radioname;
        const motd = ctx.request?.body?.motd;
        const source = ctx.request?.body?.source;
        const icestats = ctx.request?.body?.icestats;
        const logo = ctx.request?.body?.logo;
        const website = ctx.request?.body?.website;
        const twitch = ctx.request?.body?.twitch;

        if (this.inProgress.setRadio) {
            ctx.response.status = 500;
            ctx.response.body = 'Radio station setting already in progress';
            return;
        }
        this.inProgress.setRadio = true;

        let update = true;

        const failValidation = (message) => {
            delete this.inProgress.setRadio;
            ctx.throw(400, message);
        };

        if (!source) {
            return failValidation('missing source');
        }

        if (!channel) {
            return failValidation('missing channel');
        }

        if (!mbID) {
            return failValidation('missing id');
        }

        if (!channel.match(/^#(.+)$/)) {
            return failValidation('invalid channel');
        }

        const chan = this.channels[channel.toLowerCase()];

        if (!chan) {
            return failValidation('not in the channel');
        }

        if (!utils.isValidSecureURL(source)) {
            return failValidation('source need https');
        }

        if (!chan.source) {
            for (const channelObj of Object.values(this.channels)) {
                if ((channelObj.source) && (channelObj.source.toLowerCase() === source.toLowerCase()) && (channelObj.name.toLowerCase() !== channel.toLowerCase())) {
                    return failValidation('source must be unique');
                }
            }
            update = false;
        }

        if (!radioname) {
            return failValidation('missing radio name');
        }

        if (!motd) {
            return failValidation('missing radio description');
        }

        if ((motd.length < 40) || (motd.length > 120)) {
            return failValidation('description min 40 chars max 120 chars');
        }

        if (!icestats) {
            return failValidation('missing icestats url');
        }

        if (!utils.isValidSecureURL(icestats)) {
            return failValidation('icestats need https');
        }

        if (!logo) {
            return failValidation('missing logo url');
        }

        if (!utils.isValidSecureURL(logo)) {
            return failValidation('logo need https');
        }

        if ((website) && (!utils.isValidURL(website))) {
            return failValidation('not valid URL');
        }

        if ((twitch) && (!utils.isValidSecureURL(twitch))) {
            return failValidation('invalid twitch channel URL');
        }

        if (update === false) {
            this.dbCon.query('INSERT INTO magirc_mediabot_radio (id, channel, name, description, source, icestats, logo, website, twitch, nowplay, announce, timer, dj, requests) values (?,?,?,?,?,?,?,?,?,0,0,30,\'\',0)', [mbID, channel, radioname, motd, source, icestats, logo, website, twitch], (error, results, fields) => {
                if (error) throw error;

                chan.radioname = radioname;
                chan.motd = motd;
                chan.source = source;
                chan.icestats = icestats;
                chan.logo = logo;
                chan.website = website;
                chan.twitch = twitch;
                console.log(chan);
            });
        } else {
            this.dbCon.query('UPDATE magirc_mediabot_radio SET name = ?, description = ?, source = ?, icestats = ?, logo = ?, website = ?, twitch = ? WHERE id = ?', [radioname, motd, source, icestats, logo, website, twitch, mbID], (error, results, fields) => {
                if (error) throw error;

                chan.radioname = radioname;
                chan.motd = motd;
                chan.source = source;
                chan.icestats = icestats;
                chan.logo = logo;
                chan.website = website;
                chan.twitch = twitch;
                console.log(chan);
            });
        }

        // ctx.body = `Request Body: ${JSON.stringify(ctx.request.body)}`;
        ctx.response.body = ctx.request.body;
        delete this.inProgress.setRadio;
    }

    async handleSetRadioAdv(ctx) {
        const mbID = ctx.request?.body?.mbID;
        const channel = ctx.request?.body?.channel;
        const announce = ctx.request?.body?.announce;
        const timer = ctx.request?.body?.timer;

        if (this.inProgress.setAdv) {
            ctx.response.status = 500;
            ctx.response.body = 'Advertise timer setting already in progress';
            return;
        }
        this.inProgress.setAdv = true;

        const failValidation = (message) => {
            delete this.inProgress.setAdv;
            ctx.throw(400, message);
        };

        if (!channel) {
            return failValidation('missing channel');
        }

        if (!mbID) {
            return failValidation('missing id');
        }

        if (!channel.match(/^#(.+)$/)) {
            return failValidation('invalid channel');
        }

        const chan = this.channels[channel.toLowerCase()];

        if (!chan) {
            return failValidation('not in the channel');
        }

        if (isNaN(announce)) {
            return failValidation('not number');
        }

        if (isNaN(timer)) {
            return failValidation('not number');
        }

        if (timer < 10) {
            return failValidation('timer min interval 10 min');
        }

        if (timer > 50) {
            return failValidation('timer max interval 50 min');
        }

        this.dbCon.query('UPDATE magirc_mediabot_radio SET announce = ?, timer = ? WHERE id = ?', [announce, timer, mbID], (error, results, fields) => {
            if (error) throw error;
            
            chan.announce = announce;
            console.log(typeof chan.announce);
            
            chan.timer = timer;
            if (chan.announce === '1') {
                if (this.bot.modules['radio.js'].jobs[chan.name]) {
                    clearInterval(this.bot.modules['radio.js'].jobs[chan.name]);
                    delete this.bot.modules['radio.js'].jobs[chan.name];
                }

                const timeoutID = setInterval(() => {
                    const tagData = [
                        chan.radioname,
                        chan.mbID,
                    ];
                    this.bot.say(chan.name, 'Ascolta ' + chan.radioname + ' - ' + chan.motd + ' https://media.simosnap.com/player/' + chan.mbID, { '+simosnap.org/radio_station': tagData.join(';') });
                }, (60000 * chan.timer));
                this.bot.modules['radio.js'].jobs[chan.name] = timeoutID;
            } else {
                clearInterval(this.bot.modules['radio.js'].jobs[chan.name]);
                delete this.bot.modules['radio.js'].jobs[chan.name];
            }

            //console.log(chan);
        });

        ctx.response.body = ctx.request.body;
        delete this.inProgress.setAdv;
    }

    async handleSetRadioNp(ctx) {
        const mbID = ctx.request?.body?.mbID;
        const channel = ctx.request?.body?.channel;
        const nowplay = ctx.request?.body?.nowplay;

        if (this.inProgress.nowPlay) {
            ctx.response.status = 500;
            ctx.response.body = 'Nowplay setting already in progress';
            return;
        }
        this.inProgress.nowPlay = true;

        const failValidation = (message) => {
            delete this.inProgress.nowPlay;
            ctx.throw(400, message);
        };

        if (!channel) {
            return failValidation('missing channel');
        }

        if (!mbID) {
            return failValidation('missing id');
        }

        if (!channel.match(/^#(.+)$/)) {
            return failValidation('invalid channel');
        }

        const chan = this.channels[channel.toLowerCase()];

        if (!chan) {
            return failValidation('not in the channel');
        }

        if (isNaN(nowplay)) {
            return failValidation('not number');
        }

        this.dbCon.query('UPDATE magirc_mediabot_radio SET nowplay = ? WHERE id = ?', [nowplay, mbID], (error, results, fields) => {
            if (error) throw error;

            chan.nowplay = nowplay;
            console.log(typeof chan.nowplay);
            if (chan.nowplay === '1') {
                if (this.bot.modules['radio.js'].playjobs[chan.name]) {
                    clearInterval(this.bot.modules['radio.js'].playjobs[chan.name]);
                    delete this.bot.modules['radio.js'].playjobs[chan.name];
                }

                const timeoutID = setInterval(async() => {
                    const json = await fetch(chan.icestats).then((r) => r.json());
                    if (!json) {
                        return;
                    }

                    const artist = json.icestats.source.artist;
                    const song = json.icestats.source.artist;
                    const nowplaying = json.icestats.source.yp_currently_playing;

                    const tagData = [
                        artist,
                        song,
                    ];
                    this.bot.say(chan.name, '[ Adesso su ' + chan.radioname + ' ] ' + nowplaying + ' https://media.simosnap.com/player/' + chan.mbID, { '+simosnap.org/radio_stream': tagData.join(';') });
                }, (60000 * 5));
                this.bot.modules['radio.js'].playjobs[chan.name] = timeoutID;
            } else {
                clearInterval(this.bot.modules['radio.js'].playjobs[chan.name]);
                delete this.bot.modules['radio.js'].playjobs[chan.name];
            }

            //console.log(chan);
        });

        ctx.response.body = ctx.request.body;
        delete this.inProgress.nowPlay;
    }

    async handleSetRadioReq(ctx) {
        const mbID = ctx.request?.body?.mbID;
        const channel = ctx.request?.body?.channel;
        const dj = ctx.request?.body?.dj;
        const requests = ctx.request?.body?.requests;

        if (this.inProgress.setReq) {
            ctx.response.status = 500;
            ctx.response.body = 'Requests setting already in progress';
            return;
        }
        this.inProgress.setReq = true;

        const failValidation = (message) => {
            delete this.inProgress.setReq;
            ctx.throw(400, message);
        };

        if (!channel) {
            return failValidation('missing channel');
        }

        if (!mbID) {
            return failValidation('missing id');
        }

        if (!channel.match(/^#(.+)$/)) {
            return failValidation('invalid channel');
        }

        const chan = this.channels[channel.toLowerCase()];

        if (!chan) {
            return failValidation('not in the channel');
        }
        
        console.log('getUser', chan.getUser(dj));
        if (requests === 1) {
            if (!dj) {
                return failValidation('dj must be set to enable requests');
            }        
    
            if (dj.length === 0) {
                return failValidation('dj must be set to enable requests');
            }

            if (chan.getUser(dj) === undefined) {
                return failValidation('dj need to match a connected nickname ');
            }
        }
        
        if (isNaN(requests)) {
            return failValidation('not number');
        }

        this.dbCon.query('UPDATE magirc_mediabot_radio SET dj = ? , requests = ? WHERE id = ?', [dj, requests, mbID], (error, results, fields) => {
            if (error) throw error;

            chan.dj = dj;
            chan.requests = requests;

            console.log(chan);
        });

        ctx.response.body = ctx.request.body;
        delete this.inProgress.setReq;
    }
};
