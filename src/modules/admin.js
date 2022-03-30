// const adm = require('../misc/admin.js');
const Channel = require('../lib/channel');

module.exports = class admin {
    constructor(bot, config, channels, dbCon) {
        bot.on('bot.command.mediabot', (event) => {
            const cmd = event.botParams[0];
            const channel = event.botParams[1];
            // const isOwner = chan.getUser(event.nick).modes.includes('o');

            if (channel.indexOf('#') === -1) {
                // return;
                console.log('errore 1');
                return;
            }

            if (event.replyTarget.toLowerCase() !== config.botcentral.toLowerCase()) {
                return;
            }

            switch (cmd) {
            case '+chan':

                if (!channels[channel]) {
                    dbCon.query('INSERT INTO magirc_mediabot_main (name) values (?)', [channel], function (error, results, fields) {
                        if (error) {
                            throw error;
                        } else {
                            const mbID = results.insertId;
                            dbCon.query('INSERT INTO magirc_mediabot_youtube (id, channel, enabled) values (?,?,?)', [mbID, channel, 1], function (error, results, fields) { if (error) throw error; });
                            dbCon.query('INSERT INTO magirc_mediabot_mixcloud (id, channel, enabled) values (?,?,?)', [mbID, channel, 1], function (error, results, fields) { if (error) throw error; });
                            const chan = new Channel(bot, channel);
                            channels[channel.toLowerCase()] = chan;
                            const obj = { mbID: mbID, radioname: '', motd: '', source: '', icestats: '', logo: '', website: '', twitch: '', nowplay: 0, announce: 0, timer: 0, requests: 0, youtube: 1, mixcloud: 1 };
                            Object.assign(chan, obj);
                            bot.join(channel);
                            bot.notice(event.nick, `Hai aggiunto ${bot.user.nick} al canale ${channel}`);
                        }
                    });
                } else {
                    bot.notice(event.nick, `${bot.user.nick} è già presente nel canale ${channel}`);
                }
                break;
            case '-chan':
                if (channels[channel]) {
                    dbCon.query('DELETE FROM magirc_mediabot_main WHERE name = (?)', [channel], function (error, results, fields) {
                        if (error) throw error;
                        delete channels[channel];
                        bot.part(channel);
                        bot.notice(event.nick, `Hai rimosso ${bot.user.nick} dal canale ${channel}`);
                        console.log(channels);
                    });
                } else {
                    bot.notice(event.nick, `${bot.user.nick} non è presente nel canale ${channel}`);
                }
                break;
            }
        });
    }
};
