const Parser = require('rss-parser');
const cron = require('node-cron');
const Yourls = require('node-yourls/yourls');
require('irc-colors').global();

module.exports = class rssnews {
    
    shortenURL(url, title) {
        return new Promise((resolve, reject) => {
            this.shortener.shorten(
                url,
                title,
                (error, result) => {
                    if (error) {
                        return reject(error);
                    }
                    return resolve(result);
                },
            );
        });
    }

    constructor(bot, config, channels, dbCon) {

        const yourlsUrl = config.yourls_url;
        const yourlsApi = config.yourls_api;

        this.shortener = new Yourls(yourlsUrl, yourlsApi);

        const parser = new Parser();
        const feeds = {};
        dbCon.query(`
            SELECT 
                *
            FROM magirc_mediabot_rss_feed`,
        (error, results, fields) => {
            if (error) throw error;

            for (const row of results) {
                const name = row.feed;
                feeds[name.toLowerCase()] = {};
                Object.assign(feeds[name.toLowerCase()], row);
            }
        },
        );

        const channelfeed = {};

        cron.schedule('*/1 * * * *', () => {
            (async() => {
                for (const key in feeds) {
                    // console.log(`${key}: ${feeds[key].feed}`);
                    try {
                        const feed = await parser.parseURL(feeds[key].feed);

                        if ((!feeds[key].last) || (feeds[key].last !== feed.items[0].link)) {
                            const shortener = await this.shortenURL(feed.items[0].link, feeds[key].title);

                            feeds[key].title = feed.title;
                            feeds[key].data = {};

                            Object.assign(feeds[key].data, feed.items[0]);
                            feeds[key].last = feed.items[0].link;
                            feeds[key].data.shorturl =  'https://ilnk.news/' + shortener.url.keyword;
                        }
                    } catch (error) {
                        return;
                    }
                }

                // for (const chan in Object.values(channels)) {
                for (const key in channels) {
                    const chan = channels[key];
                    
                    if (!channelfeed[chan.name]) {
                        channelfeed[chan.name] = {};
                    }
                    //console.log(chan.name, channelfeed[chan.name]);
                    
                    if ((chan.subscriptions.length !== 0) && (chan.rss === 1)) {
                        const subscriptions = chan.subscriptions.split('|');

                        for (const subscription of subscriptions) {
                            if (!channelfeed[chan.name][subscription]) {
                                channelfeed[chan.name][subscription] = { last: '' };
                            }

                            if (feeds[subscription].data) {
                                if (feeds[subscription].data.link === channelfeed[chan.name][subscription].last) {
                                    // console.log('last:', channelfeed[chan.name][subscription].last);

                                } else {
                                    const suffix = ('['+feeds[subscription].data.shorturl+']').irc.teal();
                                    const tagData = [
                                        feeds[subscription].title.replace(/ +(?= )/g, ''),
                                        feeds[subscription].tag,
                                        feeds[subscription].data.title,
                                        feeds[subscription].data.shorturl,
                                    ];

                                    bot.say(chan.name, `📰 ${feeds[subscription].feed_name.replace(/ +(?= )/g, '').irc.teal.bold()}: ${feeds[subscription].data.title} ${suffix}`, { '+simosnap.org/news': tagData.join(';') });
                                    channelfeed[chan.name][subscription].name = feeds[subscription].title;
                                    channelfeed[chan.name][subscription].last = feeds[subscription].data.link;
                                }
                            }
                        }
                    }
                }
            })();
        });

        bot.on('bot.command.rss', (event) => {
            const chan = channels[event.replyTarget.toLowerCase()]; if (!chan) { console.error('i expected a channel object'); return; }
            const isOwner = chan.getUser(event.nick).modes.includes('q');

            if (!event.account) {
                bot.say(event.replyTarget, 'Autenticati ad un account per usare il bot');
                return;
            }

            switch (event.botParams[0]) {
            case 'enable':
                if (!isOwner) {
                    bot.notice(event.nick, 'E\' richiesto lo stato di Owner per configurare il bot');
                    return;
                }
                dbCon.query('UPDATE magirc_mediabot_rss SET enabled = 1  WHERE channel =\'' + event.replyTarget + '\'', function (error, results, fields) {
                    if (error) throw error;
                    chan.rss = 1;
                    bot.notice(event.nick, 'Hai abilitato il modulo RSS');
                });
                break;
            case 'disable':
                if (!isOwner) {
                    bot.notice(event.nick, 'E\' richiesto lo stato di Owner per configurare il bot');
                    return;
                }
                dbCon.query('UPDATE magirc_mediabot_rss SET enabled = 0  WHERE channel =\'' + event.replyTarget + '\'', function (error, results, fields) {
                    if (error) throw error;
                    chan.rss = 0;
                    bot.notice(event.nick, 'Hai disabilitato il modulo RSS');
                });
                break;
            }
        });
    }
};
