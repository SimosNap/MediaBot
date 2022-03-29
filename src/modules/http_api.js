const Koa = require('koa');
const KoaRouter = require('koa-router');

module.exports = class HttpAPI {
    constructor(bot, config, channels, dbCon) {
        this.bot = bot;
        this.channels = channels
        this.koa = new Koa();
        this.api = new KoaRouter({
            prefix: '/api',
        });
        this.api.get('/get/nick', this.handleGetNick.bind(this));
        this.api.get('/get/channel/:Chan', this.handleGetChan.bind(this));
        this.api.get('/set/nick/:newNick', this.handleSetNick.bind(this));

        this.koa.use(this.api.routes());
        this.koa.use(this.api.allowedMethods());

        //this.koa.listen(3000, '127.0.0.1');
        this.koa.listen(3000);
    }

    async handleGetNick(ctx) {
        ctx.body = this.bot.user.nick || '';
        console.log(this.channels);
    }

    async handleGetChan(ctx) {
        const Chan = ctx.params.Chan;
        if (!Chan) {
            return;
        }

        const chan = this.channels[Chan.toLowerCase()]; if (!chan) { console.error('i expected a channel object 1'); return; }
        console.log(chan);
        ctx.body = chan.name || '';
        //chan.dj = 'liamjnab';
    }


    async handleSetNick(ctx) {
        const newNick = ctx.params.newNick;
        if (!newNick) {
            return;
        }
        this.bot.changeNick(newNick);
    }
};