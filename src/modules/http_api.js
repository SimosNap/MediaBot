const Koa = require('koa');
const KoaRouter = require('koa-router');
const koaBody = require('koa-body');

const ircPromises = require('../lib/ircPromises');

module.exports = class HttpAPI {
    constructor(bot, config, channels, dbCon) {
        this.bot = bot;
        this.channels = channels;

        this.inProgress = Object.create(null);

        this.koa = new Koa();

        this.koa.use(koaBody());

        this.api = new KoaRouter({
            prefix: '/api',
        });

        this.api.post('/add/bot', this.handleAddBot.bind(this));
        this.api.post('/set/radio', this.handleSetRadio.bind(this));

        this.koa.use(this.api.routes());
        this.koa.use(this.api.allowedMethods());

        // this.koa.listen(3000, '127.0.0.1');
        this.koa.listen(3000);
    }

    async handleAddBot(ctx) {
        // ctx.body = `Request Body: ${JSON.stringify(ctx.request.body)}`;
        const newChan = ctx.request?.body?.channel;
        const mbID = ctx.request?.body?.mbID;

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

        if (!mbID) {
            return failValidation('mbID required');
        }

        const chan = channels[newChan.toLowerCase()];

        if (chan) {
            return failValidation('channel already exist');
        }

        try {
            const addedChan = await ircPromises.joinChan(this.bot, newChan, this.channels);
            ctx.response.status = 200;
            ctx.response.body = { nick: addedChan };
        } catch (err) {
            ctx.response.status = 500;
            ctx.response.body = err;
        }

        delete this.inProgress.chanJoin;
    }

    async handleSetRadio(ctx) {
        ctx.body = `Request Body: ${JSON.stringify(ctx.request.body)}`;
    }
};
