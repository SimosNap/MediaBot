const tubefetch = require('../misc/youtube.js');

module.exports = class youtube {
    constructor(bot, config, channels, dbCon) {
        this.youtubeRegex = /((?:https?:)?\/\/)?((?:www|m)\.)?((?:youtube\.com|youtu.be))(\/(?:[\w-]+\?v=|embed\/|v\/)?)(?<ytID>[\w-]+)(\S+)?/i;

        bot.on('message', async(event) => {
            if (event.from_server) {
                return;
            }

            if (event.target.toLowerCase() === bot.user.nick.toLowerCase()) {
                return;
            }

            const chan = channels[event.target.toLowerCase()]; if (!chan) { console.error('i expected a channel object'); return; }

            if (chan && chan.youtube === 0) {
                return;
            };

            const match = event.message.match(this.youtubeRegex);
            if (!match || !match.groups.ytID) {
                console.log('returning from match');
                return;
            }

            const info = await tubefetch.getYoutubeInfo(match.groups.ytID);
            if (!info) {
                return;
            }

            const mediUrl = new URL('https://www.simosnap.org/channel/' + encodeURIComponent(event.target) + '/profile#mediabot');

            const tagData = [
                match.groups.ytID,
                info.contentDetails.duration,
                info.snippet.channelId,
                info.snippet.channelTitle,
                event.nick,
            ];

            bot.say(event.target, `[Titolo] *** ${info.snippet.title} *** [ MediaBot Timeline - ${mediUrl}]`, { '+simosnap.org/youtube': tagData.join(';') });

            if (!event.tags.account) {
                return;
            }

            const ts = Math.round((new Date()).getTime() / 1000);
            dbCon.query('INSERT INTO magirc_mediabot_media_logs (media_id, title, thumbnail, nickname, account, channel, ychannel, ychanneltitle, duration, ts, type) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [match.groups.ytID, tubefetch.removeEmojis(info.snippet.title), info.snippet.thumbnails.default.url, event.nick, event.tags.account, event.target, info.snippet.channelId, info.snippet.channelTitle, info.contentDetails.duration, ts, 'youtube'], async function (error, results, fields) {
                if (error) throw error;
            });

            // could also use tagmsg if you dont want a message to actually show for normal clients
            // bot.tagmsg(event.target, { '+simosnap.org/youtube': tagData.join(';') });
        });

        bot.on('bot.command.youtube', (event) => {
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
                dbCon.query('UPDATE magirc_mediabot_youtube SET enabled = 1  WHERE channel =\'' + event.replyTarget + '\'', function (error, results, fields) {
                    if (error) throw error;
                    chan.youtube = 1;
                    bot.notice(event.nick, 'Hai abilitato il modulo YouTube');
                });
                break;
            case 'disable':
                if (!isOwner) {
                    bot.notice(event.nick, 'E\' richiesto lo stato di Owner per configurare il bot');
                    return;
                }
                dbCon.query('UPDATE magirc_mediabot_youtube SET enabled = 0  WHERE channel =\'' + event.replyTarget + '\'', function (error, results, fields) {
                    if (error) throw error;
                    chan.youtube = 0;
                    bot.notice(event.nick, 'Hai disabilitato il modulo YouTube');
                });
                break;
            }
        });
    }
};
