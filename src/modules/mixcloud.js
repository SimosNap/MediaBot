const mixcloudfetch = require('../misc/mixcloud.js');
const Yourls = require('node-yourls/yourls');
require('irc-colors').global()

module.exports = class mixcloud {

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
                
        this.mixcloudRegex = /^(?:(?:https?:)?\/\/)?(?:(?:www\.mixcloud\.com))\/(?<mixID>([\w-]+)\/([\w-]+)(?:(?:\/?)))?$/;

        bot.on('message', async(event) => {
            if (event.from_server) {
                return;
            }

            if (event.target.toLowerCase() === bot.user.nick.toLowerCase()) {
                return;
            }

            const chan = channels[event.target.toLowerCase()]; if (!chan) { console.error('i expected a channel object'); return; }

            if (chan && chan.mixcloud === 0) {
                return;
            };

            const match = event.message.match(this.mixcloudRegex);

            if (!match || !match.groups.mixID) {
                console.log('returning from match');
                return;
            }

            const info = await mixcloudfetch.getMixcloudInfo(match.groups.mixID);
            if (!info) {
                return;
            }

            const mediUrl = new URL('https://www.simosnap.org/channel/' + encodeURIComponent(event.target) + '/profile#mediabot');
            const shortener = await this.shortenURL(mediUrl.href, 'MediaBot Timeline del canale' + event.target);
            
            const prefix = 'MixCloud'.irc.bold.purple();
            const suffix = ('[MediaBot Timeline - https://ilnk.page/' + shortener.url.keyword + ']').irc.teal();
            const tagData = [
                match.groups.mixID,
                info.audio_length,
                event.nick,
                info.pictures.medium,
            ];

            bot.say(event.target, `🎧 ${prefix} *** ${info.name} [*] ${info.user.name} *** ${suffix}`, { '+simosnap.org/mixcloud': tagData.join(';') });

            /* if (!event.tags.account) {
                return;
            } */

            const ts = Math.round((new Date()).getTime() / 1000);
            dbCon.query('INSERT INTO magirc_mediabot_media_logs (media_id, title, thumbnail, nickname, account, channel, ychannel, ychanneltitle, duration, ts, type) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [match.groups.mixID, info.name, info.pictures.medium, event.nick, event.tags.account, event.target, info.user.username, info.user.name, info.audio_length, ts, 'mixcloud'], async function (error, results, fields) {
                if (error) throw error;
            });

            // could also use tagmsg if you dont want a message to actually show for normal clients
            // bot.tagmsg(event.target, { '+simosnap.org/youtube': tagData.join(';') });
        });

        bot.on('bot.command.mixcloud', (event) => {
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
                dbCon.query('UPDATE magirc_mediabot_mixcloud SET enabled = 1  WHERE channel =\'' + event.replyTarget + '\'', function (error, results, fields) {
                    if (error) throw error;
                    chan.mixcloud = 1;
                    bot.notice(event.nick, 'Hai abilitato il modulo Mixcloud');
                });
                break;
            case 'disable':
                if (!isOwner) {
                    bot.notice(event.nick, 'E\' richiesto lo stato di Owner per configurare il bot');
                    return;
                }
                dbCon.query('UPDATE magirc_mediabot_mixcloud SET enabled = 0  WHERE channel =\'' + event.replyTarget + '\'', function (error, results, fields) {
                    if (error) throw error;
                    chan.mixcloud = 0;
                    bot.notice(event.nick, 'Hai disabilitato il modulo Mixcloud');
                });
                break;
            }
        });
    }
};
